"use client";
// Server-action forms for the HQ console: inline success/error notices, field errors,
// pending state and deliberate confirmation for destructive actions.
// Submits via a transition (not the form `action` prop) so React doesn't reset the
// fields when validation fails.
import { createContext, useActionState, useContext, useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Notice } from "@/components/ui/page";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/hq/guard";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

const FormCtx = createContext<{ state: ActionState; pending: boolean }>({ state: {}, pending: false });
export const useFormCtx = () => useContext(FormCtx);

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  notices = "top",
  onDone,
  id,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  notices?: "top" | "bottom" | "none";
  onDone?: (s: ActionState) => void;
  id?: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  const [, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.at) return;
    if (state.ok && resetOnSuccess) ref.current?.reset();
    onDone?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);
  const note = <FormNotice />;
  return (
    <FormCtx.Provider value={{ state, pending }}>
      <form
        ref={ref}
        id={id}
        className={className}
        aria-busy={pending}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          start(() => run(fd));
        }}
      >
        {notices === "top" && note}
        {children}
        {notices === "bottom" && note}
      </form>
    </FormCtx.Provider>
  );
}

export function FormNotice({ className }: { className?: string }) {
  const { state } = useFormCtx();
  if (state.error) return <Notice tone="danger" className={cn("mb-4", className)}>{state.error}</Notice>;
  if (state.ok) return <Notice tone="success" className={cn("mb-4", className)}>{state.ok}</Notice>;
  return null;
}

export function FieldError({ name }: { name: string }) {
  const msg = useFormCtx().state.fields?.[name];
  return msg ? (
    <p className="mt-1.5 text-xs font-medium text-rose-600" role="alert">
      {msg}
    </p>
  ) : null;
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormCtx();
  return (
    <Button type="submit" variant={variant} size={size} className={className} name={name} value={value} disabled={pending || disabled}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

/**
 * A destructive or irreversible action behind an explicit second step. With
 * `typeToConfirm`, the confirm button only enables once the phrase is typed
 * (the server action must check the `confirm` field too).
 */
export function ConfirmAction({
  action,
  label,
  title,
  children,
  confirmLabel = "Confirm",
  typeToConfirm,
  variant = "danger",
  triggerVariant = "outline",
  size = "sm",
  icon,
  className,
}: {
  action: Action;
  label: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  typeToConfirm?: string;
  variant?: "danger" | "primary" | "dark";
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  size?: "sm" | "md";
  icon?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  if (!open)
    return (
      <div className={cn("flex flex-col items-start gap-2", className)}>
        {msg && <Notice tone="success">{msg}</Notice>}
        <Button type="button" variant={triggerVariant} size={size} onClick={() => (setOpen(true), setMsg(null))}>
          {icon}
          {label}
        </Button>
      </div>
    );
  const ready = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm.toUpperCase();
  return (
    <div className={cn("w-full rounded-2xl border p-4", variant === "danger" ? "border-rose-500/30 bg-rose-50/60" : "border-ink-200 bg-ink-50")} role="group" aria-label={typeof title === "string" ? title : undefined}>
      <ActionForm action={action} onDone={(s) => s.ok && (setOpen(false), setTyped(""), setMsg(s.ok))}>
        <div className={cn("font-display text-sm font-semibold", variant === "danger" ? "text-rose-600" : "text-ink-900")}>{title}</div>
        {children && <div className="mt-2 space-y-3 text-sm text-ink-700">{children}</div>}
        {typeToConfirm && (
          <div className="mt-3">
            <Label htmlFor="confirm-phrase">
              Type <span className="font-mono text-rose-600">{typeToConfirm}</span> to confirm
            </Label>
            <Input id="confirm-phrase" name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} className="max-w-xs" />
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <SubmitButton variant={variant} size="sm" disabled={!ready} pendingLabel="Working…">
            {confirmLabel}
          </SubmitButton>
          <Button type="button" variant="ghost" size="sm" onClick={() => (setOpen(false), setTyped(""))}>
            Cancel
          </Button>
        </div>
      </ActionForm>
    </div>
  );
}

/** One-click action button (no confirmation), e.g. "Approve". */
export function ActionButton({
  action,
  children,
  variant = "outline",
  size = "sm",
  fields,
  className,
  pendingLabel,
}: {
  action: Action;
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  fields?: Record<string, string>;
  className?: string;
  pendingLabel?: string;
}) {
  return (
    <ActionForm action={action} className={cn("inline-flex flex-col items-start gap-2", className)} notices="bottom">
      {Object.entries(fields ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel}>
        {children}
      </SubmitButton>
    </ActionForm>
  );
}
