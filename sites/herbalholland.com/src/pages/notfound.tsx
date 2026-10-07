// The herbalholland.com 404 page: night over the hills, and the way back.
import { CHROME, NOT_FOUND } from "../../content";
import { Page } from "../layout";
import { Btn, Words } from "../ui";

export function NotFoundPage() {
  return (
    <Page page="notfound" stage="night" meta={{ path: "/404", ...NOT_FOUND.meta, noindex: true }}>
      <section className="nf" data-sp="exit" data-mill="" aria-labelledby="nf-title">
        <div className="wrap nf__in">
          <p className="eyebrow" data-in="1">
            {NOT_FOUND.eyebrow}
          </p>
          <h1 id="nf-title" className="h1 rise">
            <Words text={NOT_FOUND.title} />
          </h1>
          <p className="lede" data-in="2">
            {NOT_FOUND.body}
          </p>
          <div className="ctas" data-in="3">
            <Btn href="/" magnetic>
              {NOT_FOUND.home}
            </Btn>
          </div>
          <p className="nf__try" data-in="3">
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
