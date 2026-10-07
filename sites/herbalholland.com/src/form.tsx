// Form pieces, used by the early-access sign-up (./access): a labelled field with its hint and error lines, and the
// summary alert. Every id carries the form's prefix ("ea"), so two forms could share a page; the page's script
// (client/main.ts) fills and clears the errors.
import { cx } from "./art";

/** Hint and error lines under a field; the script swaps aria-describedby to the error when there is one. */
export function Help({ p, name, hint }: { p: string; name: string; hint?: React.ReactNode }) {
  return (
    <>
      {hint && (
        <p className="field__hint" id={`${p}-${name}-hint`}>
          {hint}
        </p>
      )}
      <p className="field__err" id={`${p}-${name}-err`} hidden>
        <span />
      </p>
    </>
  );
}

export function Field({ p, name, label, hint, optional, children, wide }: { p: string; name: string; label: string; hint?: string; optional?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cx("field", wide && "field--wide")} data-field={name}>
      <label className="field__label" htmlFor={`${p}-${name}`}>
        {label}
        {optional && <span className="field__opt"> {optional}</span>}
      </label>
      {children}
      <Help p={p} name={name} hint={hint} />
    </div>
  );
}

/** The alert at the top of a form: what went wrong, focused when it matters. */
export function FormAlert() {
  return (
    <div className="form__alert" role="alert" tabIndex={-1} hidden data-form-alert="">
      <p />
    </div>
  );
}
