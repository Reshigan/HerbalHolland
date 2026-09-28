// herbalholland.com 404 — the sun nearly down behind the hills, and the way back.
import { CHROME, NOT_FOUND } from "../../content";
import { SCENES, Scene } from "../art";
import { Page } from "../layout";
import { Btn, Words } from "../ui";

export function NotFoundPage() {
  return (
    <Page page="notfound" meta={{ path: "/404", ...NOT_FOUND.meta, noindex: true }}>
      <section className="nf" data-sp="exit" aria-labelledby="nf-title">
        <Scene kind="notfound" spec={SCENES.notfound} className="nf__scene" />
        <div className="wrap nf__in">
          <p className="eyebrow">{NOT_FOUND.eyebrow}</p>
          <h1 id="nf-title" className="h1 rise">
            <Words text={NOT_FOUND.title} />
          </h1>
          <p className="lede">{NOT_FOUND.body}</p>
          <div className="phero__ctas">
            <Btn href="/" magnetic>
              {NOT_FOUND.home}
            </Btn>
          </div>
          <p className="nf__try">
            {NOT_FOUND.try}{" "}
            {CHROME.nav.map((n, i) => (
              <span key={n.key}>
                <a className="link" href={`/${n.key}`}>
                  {n.label}
                </a>
                {i < CHROME.nav.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
        </div>
      </section>
    </Page>
  );
}
