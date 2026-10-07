"use client";
// Inline editing for a table cell (or any small value): the value is a button; activating it swaps in a tiny form
// that posts to a server action through useActionState. While the action runs (and until the server's refreshed
// value arrives) the cell shows what was typed, so the change feels instant; an error keeps the form open with the
// message under it; a success shows the action's confirmation for a moment. Enter saves, Escape cancels.
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { parseRand, zar } from "@/lib/money";

export type InlineState = { ok?: string; error?: string; fields?: Record<string, string>; at?: number };
export type InlineAction = (state: InlineState, fd: FormData) => Promise<InlineState>;

export type InlineField = {
  name: string;
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  width?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  type?: "text" | "time" | "number" | "password";
  className?: string;
};

/** How the typed values are shown while they save: rands from the first field, the fields joined with " · ", or plain text. */
export type InlineFormat = "zar" | "join" | "text";

const rands = (s: string) => {
  const c = parseRand(s, { signed: true });
  return c == null ? s : zar(c);
};

export function InlineEdit({ action, fields, display, editLabel, format = "text", emptyLabel = "—", hidden, align = "left", className, saveLabel = "Save", disabled, variant = "value", secret }: {
  action: InlineAction;
  fields: InlineField[];
  display: React.ReactNode;
  /** Names the edit for assistive tech ("Shelf price for Blue Dream 3.5g"); the trigger reads as "<value>, <editLabel>". */
  editLabel: string;
  format?: InlineFormat;
  emptyLabel?: string;
  hidden?: Record<string, string>;
  align?: "left" | "right";
  className?: string;
  saveLabel?: string;
  disabled?: boolean;
  /** "value": looks like the cell's text with a pencil on hover; "button": a small outline button. */
  variant?: "value" | "button";
  /** A secret (a PIN): never echo what was typed — the trigger keeps showing `display` while it saves. */
  secret?: boolean;
}) {
  const [state, run, pending] = useActionState(action, {});
  const [, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [submitted, setSubmitted] = useState<Record<string, string> | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const id = useId();
  const serverValues = fields.map((f) => f.value).join("\u0000");
  const seen = useRef<number | undefined>(undefined);

  // The server's refreshed value replaces the optimistic one.
  useEffect(() => setSubmitted(null), [serverValues]);

  // A new result: success closes the form and shows the confirmation for a while; an error keeps the form open.
  useEffect(() => {
    if (!state.at || state.at === seen.current) return;
    seen.current = state.at;
    if (state.ok) {
      setEditing(false);
      setFlash(state.ok);
      const t = setTimeout(() => setFlash(null), 8000);
      return () => clearTimeout(t);
    }
    setSubmitted(null);
    setShowError(true);
  }, [state.at, state.ok]);

  // Focus follows the mode: into the first field on open, back to the trigger on close (saved or cancelled).
  useEffect(() => {
    if (editing) {
      const first = form.current?.querySelector<HTMLInputElement>("input:not([type=hidden])");
      first?.focus();
      first?.select();
    } else if (wasEditing.current) trigger.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const optimistic = (v: Record<string, string>) => {
    const first = v[fields[0].name] ?? "";
    if (format === "zar") return first.trim() ? rands(first) : emptyLabel;
    if (format === "join") return fields.map((f) => v[f.name] || emptyLabel).join(" · ");
    return first.trim() || emptyLabel;
  };
  const shown = submitted && !secret ? optimistic(submitted) : display;
  const busy = pending && !!submitted;

  if (!editing)
    return (
      <span className={cn("inline-flex max-w-full flex-col", align === "right" ? "items-end" : "items-start", className)}>
        <button
          ref={trigger}
          type="button"
          disabled={disabled}
          onClick={() => (setFlash(null), setShowError(false), setEditing(true))}
          aria-busy={busy || undefined}
          className={cn(
            "group/edit inline-flex max-w-full items-center gap-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:pointer-events-none",
            variant === "button"
              ? "h-8 rounded-full border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-850 hover:border-ink-300 hover:bg-ink-50"
              : "-mx-1.5 min-h-8 rounded-lg px-1.5 py-0.5 hover:bg-ink-100",
            align === "right" && "flex-row-reverse text-right",
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">{shown}</span>
          <span className="sr-only">, {editLabel}</span>
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ink-500" aria-hidden />
          ) : flash ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-leaf-600" aria-hidden />
          ) : (
            !disabled && variant === "value" && <Pencil className="h-3 w-3 shrink-0 text-ink-500 opacity-0 transition-opacity group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100" aria-hidden />
          )}
        </button>
        <span role="status" className={cn("mt-0.5 block max-w-64 text-xs text-leaf-700", !flash && "sr-only")}>
          {flash ?? ""}
        </span>
      </span>
    );

  return (
    <form
      ref={form}
      className={cn("inline-flex flex-col gap-1", align === "right" && "items-end", className)}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const values: Record<string, string> = {};
        for (const f of fields) values[f.name] = String(fd.get(f.name) ?? "");
        setSubmitted(values);
        start(() => run(fd));
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setEditing(false);
        }
      }}
    >
      <div role="group" aria-label={editLabel} className="flex flex-wrap items-center gap-1.5">
        {Object.entries(hidden ?? {}).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {fields.map((f, i) => (
          <span key={f.name} className="relative inline-flex items-center">
            <label htmlFor={`${id}-${f.name}`} className="sr-only">{f.label}</label>
            {f.prefix && <span className="pointer-events-none absolute left-2 text-xs text-ink-500" aria-hidden>{f.prefix}</span>}
            <input
              id={`${id}-${f.name}`}
              name={f.name}
              type={f.type ?? "text"}
              defaultValue={secret ? "" : (submitted?.[f.name] ?? f.value)}
              inputMode={f.inputMode}
              placeholder={f.placeholder}
              maxLength={f.maxLength}
              autoComplete="off"
              disabled={pending}
              aria-invalid={state.fields?.[f.name] ? true : undefined}
              aria-describedby={showError && state.error ? `${id}-err` : undefined}
              className={cn(
                "tnum h-8 rounded-lg border bg-white text-sm text-ink-900 placeholder:text-ink-500 focus:outline-none focus:ring-4 disabled:bg-ink-50",
                f.prefix ? "pl-6 pr-2" : "px-2",
                f.suffix && "pr-7",
                state.fields?.[f.name] ? "border-rose-500 focus:ring-rose-500/15" : "border-ink-300 focus:border-brand-500 focus:ring-brand-500/15",
                f.width ?? "w-24",
                f.className,
              )}
            />
            {f.suffix && <span className="pointer-events-none absolute right-2 text-xs text-ink-500" aria-hidden>{f.suffix}</span>}
            {i < fields.length - 1 && <span className="mx-1 text-xs text-ink-500" aria-hidden>·</span>}
          </span>
        ))}
        <button type="submit" disabled={pending} className="grid h-8 w-8 place-items-center rounded-full bg-ink-900 text-white hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-50" aria-label={saveLabel} title={saveLabel}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
        </button>
        <button type="button" disabled={pending} onClick={() => setEditing(false)} className="grid h-8 w-8 place-items-center rounded-full text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50" aria-label="Cancel" title="Cancel">
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {showError && state.error && !state.ok && (
        <p id={`${id}-err`} role="alert" className="max-w-64 text-xs font-medium text-rose-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
