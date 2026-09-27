"use client";
// Server-action forms for the store back office: inline success/error notices, field
// errors, pending state and a deliberate second step for destructive actions.
// Submits through a transition (not the form `action` prop) so React doesn't wipe the
// fields when validation fails.
import { createContext, useActionState, useContext, useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/page";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/store/context";

export type FormAction = (state: ActionState, fd: FormData) => Promise<ActionState>;

const Ctx = createContext<{ state: ActionState; pending: boolean }>({ state: {}, pending: false });
export const useFormState = () => useContext(Ctx);

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  notices = "top",
  onDone,
  id,
  "aria-label": ariaLabel,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  notices?: "top" | "bottom" | "none";
  onDone?: (s: ActionState) => void;
  id?: string;
  "aria-label"?: string;
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
  return (
    <Ctx.Provider value={{ state, pending }}>
      <form
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        className={className}
        aria-busy={pending}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          start(() => run(fd));
        }}
      >
        {notices === "top" && <FormNotice className="mb-4" />}
        {children}
        {notices === "bottom" && <FormNotice className="mt-3" />}
      </form>
    </Ctx.Provider>
  );
}

export function FormNotice({ className }: { className?: string }) {
  const { state } = useFormState();
  if (state.error) return <Notice tone="danger" className={className}>{state.error}</Notice>;
  if (state.ok) return <Notice tone="success" className={className}>{state.ok}</Notice>;
  return null;
}

export function FieldError({ name }: { name: string }) {
  const msg = useFormState().state.fields?.[name];
  return msg ? (
    <p className="mt-1.5 text-xs font-medium text-rose-600" role="alert">
      {msg}
    </p>
  ) : null;
}

type BtnProps = React.ComponentProps<typeof Button>;

export function SubmitButton({ children, pendingLabel, variant = "primary", size = "md", className, name, value, disabled, title }: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: BtnProps["variant"];
  size?: BtnProps["size"];
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormState();
  return (
    <Button type="submit" variant={variant} size={size} className={className} name={name} value={value} disabled={pending || disabled} title={title}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

/**
 * A destructive or irreversible action behind an explicit second step.
 * `children` render inside the confirm panel (extra fields, consequences).
 */
export function ConfirmAction({
  action,
  label,
  title,
  children,
  confirmLabel = "Confirm",
  fields,
  variant = "danger",
  triggerVariant = "outline",
  size = "sm",
  icon,
  className,
}: {
  action: FormAction;
  label: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  fields?: Record<string, string>;
  variant?: "danger" | "primary" | "dark";
  triggerVariant?: BtnProps["variant"];
  size?: "sm" | "md";
  icon?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // `className` styles the open confirmation panel (e.g. its width); the closed trigger stays compact.
  if (!open)
    return (
      <div className="inline-flex flex-col items-start gap-2">
        {msg && <Notice tone="success">{msg}</Notice>}
        <Button type="button" variant={triggerVariant} size={size} onClick={() => (setOpen(true), setMsg(null))}>
          {icon}
          {label}
        </Button>
      </div>
    );
  return (
    <div
      className={cn("w-full rounded-2xl border p-4 text-left", variant === "danger" ? "border-rose-500/30 bg-rose-50/60" : "border-ink-200 bg-ink-50", className)}
      role="group"
      aria-label={typeof title === "string" ? title : undefined}
    >
      <ActionForm action={action} onDone={(s) => s.ok && (setOpen(false), setMsg(s.ok))}>
        {Object.entries(fields ?? {}).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className={cn("font-display text-sm font-semibold", variant === "danger" ? "text-rose-600" : "text-ink-900")}>{title}</div>
        {children && <div className="mt-2 space-y-3 text-sm text-ink-700">{children}</div>}
        <div className="mt-4 flex flex-wrap gap-2">
          <SubmitButton variant={variant} size="sm" pendingLabel="Working…">
            {confirmLabel}
          </SubmitButton>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </ActionForm>
    </div>
  );
}

/** One-click action (no confirmation), e.g. "Acknowledge". Errors show under the button. */
export function ActionButton({ action, children, variant = "outline", size = "sm", fields, className, pendingLabel, title }: {
  action: FormAction;
  children: React.ReactNode;
  variant?: BtnProps["variant"];
  size?: BtnProps["size"];
  fields?: Record<string, string>;
  className?: string;
  pendingLabel?: string;
  title?: string;
}) {
  return (
    <ActionForm action={action} className={cn("inline-flex flex-col items-start gap-2", className)} notices="bottom">
      {Object.entries(fields ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel} title={title}>
        {children}
      </SubmitButton>
    </ActionForm>
  );
}

export function PrintButton({ label = "Print", className }: { label?: string; className?: string }) {
  return (
    <Button type="button" variant="outline" size="sm" className={cn("no-print", className)} onClick={() => window.print()}>
      {label}
    </Button>
  );
}
