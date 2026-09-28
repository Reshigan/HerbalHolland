// The early-access sign-up, "Get first access": a full section on the home page and on /stores, where every "Shop
// online" leads until the online shop opens. The form posts JSON to /api/early-access (the Worker) — first name, email
// and/or mobile, province, the 18+ and consent ticks, the ?src tag and the "website" honeypot — and follows the franchise
// form's patterns (./form): errors under each field, a summary alert, a busy button, then a thank-you. Limits and
// province codes come from the platform (src/lib/leads.ts, src/lib/sa.ts), so the Worker and the form agree.
import { num } from "@/lib/format";
import { EARLY_ACCESS_LIMITS, LEAD_LIMITS } from "@/lib/leads";
import { PROVINCES } from "@/lib/sa";
import { ACCESS, EMAIL, fill } from "../content";
import { FACTS } from "../facts";
import { Mark, cx } from "./art";
import { Field, FormAlert, Help } from "./form";
import { Head, Icon, MailTo, Rich } from "./ui";

const P = "ea";

/** The section: dark after a cream sheet (the home page), a cream sheet after a dark section (/stores). */
export function EarlyAccess({ tone = "dark" }: { tone?: "dark" | "sheet" }) {
  const a = ACCESS;
  const f = a.fields;
  // The words the script needs (the errors it checks before sending, what it says while sending), as data.
  const copy = { email: EMAIL.hello, sending: a.sending, errors: a.errors };
  const contact = { "aria-describedby": `${P}-contact-hint` };
  return (
    <section className={cx(tone === "sheet" && "sheet", "sec access", `access--${tone}`)} id="first-access" aria-labelledby="access-title">
      <div className="wrap access__grid">
        <div className="access__copy">
          <Head id="access-title" eyebrow={a.eyebrow} title={a.title} intro={fill(a.intro, { cap: num(FACTS.founding.cap) })} />
          <ul className="ticks" data-rs="">
            {a.points.map((t) => (
              <li key={t} data-r="">
                <svg viewBox="0 0 24 24" className="tick" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m7.5 12.5 3 3 6-7" />
                </svg>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="enq access__box" data-r="">
          <script type="application/json" id={`${P}-copy`} dangerouslySetInnerHTML={{ __html: JSON.stringify(copy).replace(/</g, "\\u003c") }} />
          <form className="form" noValidate aria-label={a.label} data-form={P} data-endpoint="/api/early-access">
            <FormAlert />
            <div className="hp" aria-hidden="true">
              <label htmlFor={`${P}-website`}>{f.website}</label>
              <input id={`${P}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
            </div>
            <div className="form__grid">
              <Field p={P} name="email" label={f.email.label}>
                <input className="input" id={`${P}-email`} name="email" type="email" inputMode="email" autoComplete="email" maxLength={LEAD_LIMITS.email} spellCheck={false} {...contact} />
              </Field>
              <Field p={P} name="mobile" label={f.mobile.label} hint={f.mobile.hint}>
                <input className="input" id={`${P}-mobile`} name="mobile" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} aria-describedby={`${P}-mobile-hint ${P}-contact-hint`} />
              </Field>
              {/* Email or mobile: at least one. The hint sits under both, and so does the error when neither is given. */}
              <div className="field field--wide field--note" data-field="contact">
                <Help p={P} name="contact" hint={f.contact} />
              </div>
              <Field p={P} name="firstName" label={f.firstName.label} optional={f.firstName.optional}>
                <input className="input" id={`${P}-firstName`} name="firstName" type="text" autoComplete="given-name" maxLength={EARLY_ACCESS_LIMITS.firstName} />
              </Field>
              <Field p={P} name="province" label={f.province.label} optional={f.province.optional}>
                <select className="input select" id={`${P}-province`} name="province" autoComplete="address-level1" defaultValue="">
                  <option value="">{f.province.placeholder}</option>
                  {Object.entries(PROVINCES).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="field field--wide field--check" data-field="adult">
                <label className="check" htmlFor={`${P}-adult`}>
                  <input type="checkbox" id={`${P}-adult`} name="adult" required />
                  <span>{f.adult}</span>
                </label>
                <Help p={P} name="adult" />
              </div>
              <div className="field field--wide field--check" data-field="consent">
                <label className="check" htmlFor={`${P}-consent`}>
                  <input type="checkbox" id={`${P}-consent`} name="consent" required />
                  <span>{f.consent}</span>
                </label>
                <Help p={P} name="consent" />
              </div>
            </div>
            <p className="form__privacy">
              <Icon name="medicines" size={16} />
              <span>
                <Rich text={a.privacy} />
              </span>
            </p>
            <noscript>
              <p className="form__nojs">
                {a.noscript} <MailTo email={EMAIL.hello} />.
              </p>
            </noscript>
            <div className="form__foot">
              <button type="submit" className="btn btn--primary btn--lg" disabled data-submit="">
                <span className="btn__fill" aria-hidden="true" />
                <span className="btn__label">{a.submit}</span>
                <span className="btn__icon" aria-hidden="true">
                  <Icon name="arrow" size={18} />
                  <Icon name="arrow" size={18} />
                </span>
                <Mark className="btn__mill" sails="spin" />
              </button>
            </div>
            <p className="sr-only" aria-live="polite" data-form-live="" />
          </form>
          <div className="done" data-form-done="" hidden>
            <div className="done__mill" aria-hidden="true">
              <Mark sails="gust" />
            </div>
            <h3 className="done__title" id={`${P}-done-title`} tabIndex={-1} data-done-title="">
              {a.done.title}
            </h3>
            <p className="done__body">{a.done.body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
