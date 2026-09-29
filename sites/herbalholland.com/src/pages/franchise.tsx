// herbalholland.com/franchise — who we're looking for, what owners get, how it works (the disclosure document at least
// 14 days before anything is signed: CPA franchise regulations), straight answers (no earnings, projections or
// investment figures), and the enquiry form, which posts JSON to /api/enquiry (the Worker). Province codes, capital
// bands and field limits come from the platform (src/lib/sa.ts, src/lib/leads.ts), so the Worker and the form agree.
import { CAPITAL_BANDS, CAPITAL_LABEL, LEAD_LIMITS } from "@/lib/leads";
import { PROVINCES } from "@/lib/sa";
import { num } from "@/lib/format";
import { EMAIL, FRANCHISE, fill } from "../../content";
import { Mark, cx } from "../art";
import { Field, FormAlert, Help, described as describedBy } from "../form";
import { Page } from "../layout";
import { Btn, Head, Icon, Index, MailTo, Rich } from "../ui";
import { PageHero } from "./parts";

const F = FRANCHISE.form;
const described = (name: string, hint?: unknown) => describedBy("f", name, hint);

function EnquiryForm() {
  const f = F.fields;
  // The words the script needs (errors it checks before sending, and what it says while sending), as data.
  const copy = { email: EMAIL.franchise, sending: F.sending, errors: F.errors };
  return (
    <div className="enq">
      <script type="application/json" id="f-copy" dangerouslySetInnerHTML={{ __html: JSON.stringify(copy).replace(/</g, "\\u003c") }} />
      <form className="form" noValidate aria-label={F.label} data-form="f" data-endpoint="/api/enquiry">
        <FormAlert />
        <div className="hp" aria-hidden="true">
          <label htmlFor="f-website">{f.website.label}</label>
          <input id="f-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>
        <div className="form__grid">
          <Field p="f" name="name" label={f.name.label}>
            <input className="input" id="f-name" name="name" type="text" autoComplete="name" required maxLength={LEAD_LIMITS.name} />
          </Field>
          <Field p="f" name="email" label={f.email.label}>
            <input className="input" id="f-email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={LEAD_LIMITS.email} spellCheck={false} />
          </Field>
          <Field p="f" name="phone" label={f.phone.label} hint={f.phone.hint}>
            <input className="input" id="f-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} {...described("phone", f.phone.hint)} />
          </Field>
          <Field p="f" name="area" label={f.area.label} hint={f.area.hint}>
            <input className="input" id="f-area" name="area" type="text" autoComplete="address-level2" required maxLength={LEAD_LIMITS.area} {...described("area", f.area.hint)} />
          </Field>
          <Field p="f" name="province" label={f.province.label}>
            <select className="input select" id="f-province" name="province" autoComplete="address-level1" required defaultValue="">
              <option value="" disabled>
                {f.province.placeholder}
              </option>
              {Object.entries(PROVINCES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field p="f" name="capital" label={CAPITAL_LABEL} hint={f.capital.hint}>
            <select className="input select" id="f-capital" name="capital" required defaultValue="" {...described("capital", f.capital.hint)}>
              <option value="" disabled>
                {f.capital.placeholder}
              </option>
              {CAPITAL_BANDS.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
          <Field p="f" name="experience" label={f.experience.label} hint={f.experience.hint} wide>
            <textarea
              className="input textarea"
              id="f-experience"
              name="experience"
              rows={4}
              required
              minLength={LEAD_LIMITS.experienceMin}
              maxLength={LEAD_LIMITS.experience}
              data-min={LEAD_LIMITS.experienceMin}
              {...described("experience", f.experience.hint)}
            />
          </Field>
          <fieldset className="field field--wide" data-field="pharmacist" aria-describedby="f-pharmacist-hint">
            <legend className="field__label">{f.pharmacist.label}</legend>
            <div className="radios">
              {(["yes", "no"] as const).map((v) => (
                <label key={v} className="radio">
                  <input type="radio" id={`f-pharmacist-${v}`} name="pharmacist" value={v} required />
                  <span>{f.pharmacist[v]}</span>
                </label>
              ))}
            </div>
            <Help p="f" name="pharmacist" hint={f.pharmacist.hint} />
          </fieldset>
          <Field p="f" name="message" label={f.message.label} optional={f.message.optional} hint={fill(f.message.hint, { n: num(LEAD_LIMITS.message) })} wide>
            <textarea className="input textarea" id="f-message" name="message" rows={3} maxLength={LEAD_LIMITS.message} {...described("message", "x")} />
          </Field>
          <div className="field field--wide field--check" data-field="consent">
            <label className="check" htmlFor="f-consent">
              <input type="checkbox" id="f-consent" name="consent" required />
              <span>
                <Rich text={f.consent.label} />
              </span>
            </label>
            <Help p="f" name="consent" />
          </div>
        </div>
        <p className="form__privacy">
          <Icon name="medicines" size={16} />
          <span>{F.privacy}</span>
        </p>
        <noscript>
          <p className="form__nojs">
            {F.noscript} <MailTo email={EMAIL.franchise} />.
          </p>
        </noscript>
        <div className="form__foot">
          <button type="submit" className="btn btn--primary btn--lg" disabled data-submit="">
            <span className="btn__fill" aria-hidden="true" />
            <span className="btn__label">{F.submit}</span>
            <span className="btn__icon" aria-hidden="true">
              <Icon name="arrow" size={18} />
            </span>
            <Mark className="btn__mill" use />
          </button>
          <p className="form__email">
            {FRANCHISE.enquire.email} <MailTo email={EMAIL.franchise} />
          </p>
        </div>
        <p className="sr-only" aria-live="polite" data-form-live="" />
      </form>
      <template data-form-done="">
        <div className="done">
        <div className="done__mill" aria-hidden="true">
          <Mark sails="gust" />
        </div>
        <h3 className="done__title" id="done-title" tabIndex={-1} data-done-title="">
          {F.done.title}
        </h3>
        <p className="done__ref" data-ref-line="">
          {F.done.reference} <strong data-ref="" />. {F.done.keep}
        </p>
        <p className="eyebrow">{F.done.next}</p>
        <ol className="done__steps">
          {F.done.steps.map((s, i) => (
            <li key={i}>
              <Index n={i + 1} />
              <span>{s}</span>
            </li>
          ))}
        </ol>
        </div>
      </template>
    </div>
  );
}

export function FranchisePage() {
  const { hero, who, offer, steps, faq, enquire } = FRANCHISE;
  const crumbs = [{ label: FRANCHISE.meta.title, path: "/franchise" }];
  // The FAQ as FAQPage data, so the answers can show in search.
  const faqLd = { "@type": "FAQPage", mainEntity: faq.items.map((q) => ({ "@type": "Question", name: q.q, acceptedAnswer: { "@type": "Answer", text: q.a } })) };
  return (
    <Page page="franchise" stage="dusk" meta={{ path: "/franchise", ...FRANCHISE.meta, crumbs }} jsonLd={faqLd}>
      <PageHero kind="franchise" eyebrow={hero.eyebrow} title={hero.title} lede={hero.lede} crumbs={crumbs}>
        <div className="ctas">
          <Btn href="#enquire" magnetic>
            {hero.enquire}
          </Btn>
          <Btn href="#how" kind="ghost" icon={null}>
            {hero.how}
          </Btn>
        </div>
        <p className="phero__note">
          {hero.timing}{" "}
          <a className="link" href="/stores">
            {hero.stores}
          </a>
        </p>
      </PageHero>

      <section className="sheet sec" aria-labelledby="who-h">
        <div className="wrap">
          <Head id="who-h" eyebrow={who.eyebrow} title={who.title} />
          <ul className="grid4" data-rs="">
            {who.items.map((it, i) => (
              <li key={it.key} className="tile" data-r="">
                <div className="tile__top">
                  <Index n={i + 1} />
                  <span className="tile__ico">
                    <Icon name={it.key} />
                  </span>
                </div>
                <h3 className="h3">{it.title}</h3>
                <p>{it.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec offer" aria-labelledby="offer-h">
        <div className="wrap">
          <Head id="offer-h" eyebrow={offer.eyebrow} title={offer.title} intro={offer.intro} />
          {offer.groups.map((g) => (
            <div key={g.title} className="offer__group">
              <h3 className="offer__h" data-r="">
                {g.title}
              </h3>
              <ul className="grid3" data-rs="">
                {g.items.map((it) => (
                  <li key={it.key} className="feat" data-r="">
                    <span className="feat__ico">
                      <Icon name={it.key} />
                    </span>
                    <h4 className="feat__t">{it.title}</h4>
                    <p>{it.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="sheet sec" id="how" aria-labelledby="how-h">
        <div className="wrap sticky-split">
          <div className="sticky-split__side">
            <Head id="how-h" eyebrow={steps.eyebrow} title={steps.title} intro={steps.intro} />
          </div>
          <div className="steps" data-sp="center">
            <span className="steps__line" aria-hidden="true">
              <i />
            </span>
            <ol className="steps__list">
            {steps.items.map((s, i) => (
              <li key={s.key} className={cx("step", s.key === "disclosure" && "step--key")} data-r="">
                <span className="step__node" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="step__t">
                  <span className="sr-only">{fill(steps.step, { n: i + 1 })}</span>
                  {s.title}
                </h3>
                {s.key === "disclosure" && <p className="badge">{steps.badge}</p>}
                <p className="step__b">{s.body}</p>
              </li>
            ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="sec faq" aria-labelledby="faq-h">
        <div className="wrap sticky-split">
          <div className="sticky-split__side">
            <Head id="faq-h" eyebrow={faq.eyebrow} title={faq.title}>
              <p className="muted faq__ask" data-r="">
                {faq.intro} <MailTo email={EMAIL.franchise} />.
              </p>
            </Head>
          </div>
          <div className="acc" data-acc="">
            {faq.items.map((q, i) => (
              <details key={q.q} className="acc__item" data-r="">
                <summary className="acc__q">
                  <Index n={i + 1} />
                  <span className="acc__qt">{q.q}</span>
                  <span className="acc__pm" aria-hidden="true" />
                </summary>
                <div className="acc__a">
                  <p>{q.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="sheet sec enquire" id="enquire" aria-labelledby="enquire-h">
        <div className="wrap sticky-split">
          <div className="sticky-split__side">
            <Head id="enquire-h" eyebrow={enquire.eyebrow} title={enquire.title} intro={enquire.body} />
            <div className="poster" data-r="scale" aria-hidden="true">
              <Mark className="poster__mark" use />
            </div>
          </div>
          <EnquiryForm />
        </div>
      </section>
    </Page>
  );
}
