// Client fetch helper for /api/pos/*. Network failures raise OfflineError and flip the
// till's connectivity state; 401s tell the app to show the lock screen or re-pair.
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}
/** A failure the till explains under its own heading (e.g. a limited drop refusing the sale at the tender step). */
export class TillError extends Error {
  constructor(public title: string, message: string) {
    super(message);
  }
}
export class OfflineError extends Error {
  constructor(public timedOut = false) {
    super(timedOut ? "The server is taking too long to answer — try again" : "No connection — check the Wi-Fi or mobile data");
  }
}

type PosEvent = "online" | "offline" | "locked" | "unpaired";
const listeners = new Set<(e: PosEvent) => void>();
export const onPosEvent = (fn: (e: PosEvent) => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const emit = (e: PosEvent) => listeners.forEach((fn) => fn(e));

export async function api<T>(path: string, opts: { method?: string; body?: unknown; timeoutMs?: number; quiet401?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
  } catch (e) {
    // A slow answer isn't a lost connection: only hard network failures flip the till offline.
    // Callers still get an OfflineError, so e.g. a sale that timed out is queued (the id makes it idempotent).
    const timedOut = (e as Error)?.name === "TimeoutError";
    if (!timedOut) emit("offline");
    throw new OfflineError(timedOut);
  }
  emit("online");
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    if (res.status === 401 && !opts.quiet401) emit(data.code === "UNPAIRED" ? "unpaired" : data.code === "LOCKED" ? "locked" : "online");
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  }
  return data;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
