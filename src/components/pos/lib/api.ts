// Client fetch helper for /api/pos/*. Network failures raise OfflineError and flip the
// till's connectivity state; 401s tell the app to show the lock screen or re-pair.
import { trainingAllows, TrainingError } from "./training";

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

// Training mode: every request that would change something of record is refused before it leaves the till
// (rules: lib/training.ts). The app sets the flag from the stored training state before its first request.
let trainingOn = false;
export const setTrainingGuard = (on: boolean) => void (trainingOn = on);
export const trainingGuardOn = () => trainingOn;

type PosEvent = "online" | "offline" | "locked" | "unpaired";
const listeners = new Set<(e: PosEvent) => void>();
export const onPosEvent = (fn: (e: PosEvent) => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const emit = (e: PosEvent) => listeners.forEach((fn) => fn(e));

export async function api<T>(path: string, opts: { method?: string; body?: unknown; timeoutMs?: number; quiet401?: boolean; sync?: boolean } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  // `sync` marks the outbox: real sales rung up before training started still sync (they are not practice sales).
  if (trainingOn && !opts.sync && !trainingAllows(method, path)) throw new TrainingError();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
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
  const data = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok) {
    if (res.status === 401 && !opts.quiet401) emit(data?.code === "UNPAIRED" ? "unpaired" : data?.code === "LOCKED" ? "locked" : "online");
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data?.code);
  }
  // A body cut off mid-read (e.g. by a reload) is no answer: callers get an OfflineError (a sale is queued and retried
  // idempotently) rather than an empty object they'd cache as the session or catalogue.
  if (data === null) throw new OfflineError(true);
  return data;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
