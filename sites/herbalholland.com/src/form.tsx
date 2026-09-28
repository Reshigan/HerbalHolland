// Form pieces shared by the franchise enquiry (./pages/franchise) and the early-access sign-up (./access): a labelled
// field with its hint and error lines, and the summary alert. Every id carries the form's prefix ("f", "ea"), so two
// forms could share a page; the page's script (client/main.ts) fills and clears the errors.
import { cx } from "./art";

const ErrIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 7v6M12 16.5v.5" />
  </svg>
);

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
        <ErrIcon />
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

/** aria-describedby for a control with a hint (the script adds the error line's id when there's an error). */
export const described = (p: string, name: string, hint?: unknown) => (hint ? { "aria-describedby": `${p}-${name}-hint` } : {});

/** The alert at the top of a form: what went wrong, focused when it matters. */
export function FormAlert() {
  return (
    <div className="form__alert" role="alert" tabIndex={-1} hidden data-form-alert="">
      <ErrIcon />
      <p />
    </div>
  );
}
