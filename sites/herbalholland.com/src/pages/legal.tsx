// herbalholland.com/privacy and /terms — the Privacy Policy (POPIA) and the Terms of Use, as complete documents: title,
// version and date, a short summary, contents with anchor links, then numbered sections (#who, #rights, …). The words
// are in ../../content (LEGAL, PRIVACY, TERMS). The company's registered details come from ../../facts wherever the law
// expects them, and a neutral line stands in until they're filled in. Both pages open without the 18+ gate: they're
// what the gate asks visitors to accept, so they have to be readable first.
import { CONTACT, LEGAL, PRIVACY, TERMS, fill, type LegalDoc, type LegalPara } from "../../content";
import { FACTS, longDate } from "../../facts";
import { Page } from "../layout";
import { Index, Rich } from "../ui";
import { PageHero } from "./parts";

/** The company's registered details from ../../facts, or the neutral line while there are none. */
function Company() {
  const c = FACTS.company;
  const r = CONTACT.company.rows;
  const rows = (
    [
      [r.legalName, c.legalName],
      [r.regNumber, c.regNumber],
      [r.vatNumber, c.vatNumber],
      [r.address, c.address],
      [r.phone, c.phone],
    ] as [string, string | null][]
  ).filter((row): row is [string, string] => !!row[1]);
  if (!rows.length)
    return (
      <p>
        <Rich text={LEGAL.company.pending} />
      </p>
    );
  return (
    <>
      {rows.map(([k, v]) => (
        <p key={k}>
          <b>{k}:</b> {v}
        </p>
      ))}
    </>
  );
}

function Para({ p }: { p: LegalPara }) {
  if (p === "{company}") return <Company />;
  if (typeof p === "string")
    return (
      <p>
        <Rich text={p} />
      </p>
    );
  return (
    <p>
      <b>{p[0]}</b> <Rich text={p[1]} />
    </p>
  );
}

function LegalPage({ page, doc }: { page: "privacy" | "terms"; doc: LegalDoc }) {
  const { hero, summary, sections } = doc;
  return (
    <Page page={page} meta={{ path: `/${page}`, ...doc.meta }} free>
      <PageHero kind={page} eyebrow={hero.eyebrow} title={hero.title} lede={hero.lede}>
        <p className="phero__note">{fill(LEGAL.version, { version: doc.version, date: longDate(doc.updated, { weekday: false }) })}</p>
      </PageHero>

      <section className="sheet sec" aria-labelledby="page-title">
        <div className="wrap">
          <div className="split">
            <div className="note">
              <h2 className="h3">{summary.title}</h2>
              <ul className="ticks">
                {summary.points.map((t) => (
                  <li key={t}>
                    <svg viewBox="0 0 24 24" className="tick" aria-hidden="true" focusable="false">
                      <circle cx="12" cy="12" r="10" />
                      <path d="m7.5 12.5 3 3 6-7" />
                    </svg>
                    {t}
                  </li>
                ))}
              </ul>
              {summary.scope && <p>{summary.scope}</p>}
            </div>
            <nav aria-labelledby="toc-h">
              <h2 id="toc-h" className="eyebrow">
                {LEGAL.contents}
              </h2>
              <ol>
                {sections.map((s, i) => (
                  <li key={s.key}>
                    <a className="inbox__link" href={`#${s.key}`}>
                      {i + 1}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>

          <ol className="rules">
            {sections.map((s, i) => (
              <li key={s.key} id={s.key} className="rule">
                <div className="rule__head">
                  <Index n={i + 1} className="rule__n" />
                </div>
                <h2 className="h3 rule__title">{s.title}</h2>
                <div className="rule__body">
                  {s.body.map((p, j) => (
                    <Para key={j} p={p} />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </Page>
  );
}

export const PrivacyPage = () => <LegalPage page="privacy" doc={PRIVACY} />;
export const TermsPage = () => <LegalPage page="terms" doc={TERMS} />;
