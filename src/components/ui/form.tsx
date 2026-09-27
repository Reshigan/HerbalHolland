import { cn } from "@/lib/cn";

const field =
  "w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 shadow-[inset_0_1px_0_rgb(0_0_0/0.02)] transition focus:border-oranje-500 focus:outline-none focus:ring-4 focus:ring-oranje-500/15 disabled:bg-ink-50 disabled:text-ink-400";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[0.78rem] font-semibold text-ink-700", className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, "h-10", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(field, "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b5f57%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_0.9rem_center] bg-no-repeat pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-24 py-2.5", className)} {...props} />;
}

export function Field({ label, hint, error, children, className, htmlFor }: { label: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p> : hint ? <p className="mt-1.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ label, description, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; description?: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", className)}>
      <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded-md border-ink-300 accent-oranje-500" {...props} />
      <span className="text-sm">
        <span className="font-medium text-ink-850">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-500">{description}</span>}
      </span>
    </label>
  );
}
