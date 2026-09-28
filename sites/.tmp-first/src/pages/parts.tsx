// Pieces shared by the inner pages: the page header (title rising word by word over a strip of hills at dusk).
import { SCENES, Scene } from "../art";
import { Words } from "../ui";

export function PageHero({ kind, eyebrow, title, lede, children }: { kind: string; eyebrow: string; title: string; lede: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className={`phero phero--${kind}`} data-sp="exit" aria-labelledby="page-title">
      <div className="wrap phero__in">
        <p className="eyebrow" data-in="1">
          {eyebrow}
        </p>
        <h1 id="page-title" className="h1 phero__title rise">
          <Words text={title} />
        </h1>
        <p className="lede" data-in="2">
          {lede}
        </p>
        {children && (
          <div className="phero__more" data-in="3">
            {children}
          </div>
        )}
      </div>
      <Scene kind={kind} spec={SCENES[kind]} className="phero__scene" />
    </section>
  );
}
