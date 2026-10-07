// herbalholland.com/careers: why work with us, the roles we hire in stores (with the franchisee who owns the store)
// and at HQ, and how to apply by email. We never charge to apply; POPIA: what we do with an application, how long.
import { CAREERS, EMAIL } from "../../content";
import { Page } from "../layout";
import { Btn, Head, Icon, Index, MailTo } from "../ui";
import { PageHero } from "./parts";

export function CareersPage() {
  const { why, roles, apply } = CAREERS;
  const crumbs = [{ label: CAREERS.meta.title, path: "/careers" }];
  return (
    <Page page="careers" stage="dusk" meta={{ path: "/careers", ...CAREERS.meta, crumbs }}>
      <PageHero kind="careers" eyebrow={CAREERS.hero.eyebrow} title={CAREERS.hero.title} lede={CAREERS.hero.lede} crumbs={crumbs}>
        <div className="ctas">
          <Btn href={`mailto:${EMAIL.careers}`} icon="mail" magnetic>
            {apply.cta}
          </Btn>
          <p className="phero__note">
            <MailTo email={EMAIL.careers} />
          </p>
        </div>
      </PageHero>

      <section className="sheet sec" aria-labelledby="why-h">
        <div className="wrap">
          <Head id="why-h" eyebrow={why.eyebrow} title={why.title} />
          <ul className="grid4" data-rs="">
            {why.items.map((it, i) => (
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

      <section className="sec" aria-labelledby="roles-h">
        <div className="wrap">
          <Head id="roles-h" eyebrow={roles.eyebrow} title={roles.title} />
          <div className="roles">
            {[roles.stores, roles.hq].map((g) => (
              <div key={g.title} className="roles__group" data-r="">
                <h3 className="offer__h">{g.title}</h3>
                <p className="muted">{g.note}</p>
                <ul className="roles__list">
                  {g.items.map((r) => (
                    <li key={r.key} className="role">
                      <span className="feat__ico">
                        <Icon name={r.key} />
                      </span>
                      <div>
                        <h4 className="feat__t">{r.title}</h4>
                        {r.aka && <p className="role__aka">{r.aka}</p>}
                        <p>{r.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sheet sec" aria-labelledby="apply-h">
        <div className="wrap split">
          <div>
            <Head id="apply-h" eyebrow={apply.eyebrow} title={apply.title} />
            <ol className="apply" data-rs="">
              {apply.steps.map((s, i) => (
                <li key={s.key} data-r="">
                  <Index n={i + 1} />
                  <div>
                    <h3 className="h3">{s.title}</h3>
                    <p>
                      {s.body} {s.key === "email" && <MailTo email={EMAIL.careers} />}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <div data-r="">
              <Btn href={`mailto:${EMAIL.careers}`} kind="dark" icon="mail" magnetic>
                {apply.cta}
              </Btn>
            </div>
          </div>
          <div className="stack" data-rs="">
            <div className="note note--warn" data-r="">
              <h3 className="h3">{apply.fee.title}</h3>
              <p>
                {apply.fee.body} <MailTo email={EMAIL.careers} />.
              </p>
            </div>
            <div className="note" data-r="">
              <h3 className="h3">{apply.popia.title}</h3>
              <p>{apply.popia.body}</p>
              <p>
                {apply.popia.ask} <MailTo email={EMAIL.careers} />.
              </p>
            </div>
          </div>
        </div>
      </section>
    </Page>
  );
}
