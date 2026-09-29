// herbalholland.com/privacy, /terms and /paia — the Privacy Policy (POPIA), the Terms of Use and the PAIA manual: title,
// version and date, a short summary, contents with anchor links, then numbered sections (#who, #rights, …). The words
// are in ../../content (LEGAL, PRIVACY, TERMS, PAIA); {legalName} and {officer} in them come from ../../facts, as do the
// registered details wherever the law expects them (a neutral line stands in for any not filled in yet). The pages open
// without the 18+ gate: the gate asks visitors to accept them, so they have to be readable first.
import { CONTACT, LEGAL, PAIA, PRIVACY, TERMS, fill, type LegalDoc, type LegalPara } from "../../content";
import { FACTS, longDate } from "../../facts";
import { Page } from "../layout";
import { Index, Rich } from "../ui";
import { PageHero } from "./parts";

/** The facts legal text names. Its links ({email}, {privacy}, …) are Rich's. */
const VARS = { legalName: FACTS.company.legalName ?? FACTS.brand, officer: FACTS.officer };
const Text = ({ t }: { t: string }) => <Rich text={fill(t, VARS)} />;

/** The company's registered details from ../../facts, and the neutral line while any the law expects is missing. */
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
  return (
    <>
      {rows.map(([k, v]) => (
        <p key={k}>
          <b>{k}:</b> {v}
        </p>
      ))}
      {(!c.regNumber || !c.address) && (
        <p>
          <Rich text={LEGAL.company.pending} />
        </p>
      )}
    </>
  );
}

function Para({ p }: { p: LegalPara }) {
  if (p === "{company}") return <Company />;
  if (typeof p === "string")
    return (
      <p>
        <Text t={p} />
      </p>
    );
  return (
    <p>
      <b>{fill(p[0], VARS)}</b> <Text t={p[1]} />
    </p>
  );
}

function LegalPage({ page, doc }: { page: "privacy" | "terms" | "paia"; doc: LegalDoc }) {
  const { hero, summary, sections } = doc;
  const crumbs = [{ label: doc.meta.title, path: `/${page}` }];
  return (
    <Page page={page} stage="night" meta={{ path: `/${page}`, ...doc.meta, crumbs }} free>
      <PageHero kind={page} eyebrow={hero.eyebrow} title={hero.title} lede={hero.lede} crumbs={crumbs}>
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
                    <span>
                      <Text t={t} />
                    </span>
                  </li>
                ))}
              </ul>
              {summary.scope && (
                <p>
                  <Text t={summary.scope} />
                </p>
              )}
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
export const PaiaPage = () => <LegalPage page="paia" doc={PAIA} />;
