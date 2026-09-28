// Pieces shared by the inner pages: the page header (title rising word by word over a strip of hills at dusk).
import { SCENES, Scene } from "../art";
import { Words } from "../ui";

export function PageHero({ kind, eyebrow, title, lede, children }: { kind: string; eyebrow: string; title: string; lede: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className={`phero phero--${kind}`} data-sp="exit" aria-labelledby="page-title">
      <div className="wrap phero__in">
        <p className="eyebrow phero__eyebrow">{eyebrow}</p>
        <h1 id="page-title" className="h1 phero__title rise">
          <Words text={title} />
        </h1>
        <p className="lede phero__lede">{lede}</p>
        {children}
      </div>
      <Scene kind={kind} spec={SCENES[kind]} className="phero__scene" />
    </section>
  );
}
