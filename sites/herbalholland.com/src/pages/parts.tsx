// Pieces shared by the inner pages: the page header (breadcrumbs, the title rising word by word over the stage, which
// holds the sky and the hills in the state the page belongs to).
import { Crumbs, type Crumb } from "../layout";
import { Words } from "../ui";

export function PageHero({ kind, eyebrow, title, lede, crumbs, children }: { kind: string; eyebrow: string; title: string; lede: React.ReactNode; crumbs: readonly Crumb[]; children?: React.ReactNode }) {
  return (
    <section className={`phero phero--${kind}`} data-sp="exit" data-mill="" aria-labelledby="page-title">
      <div className="wrap phero__in">
        <div data-in="1">
          <Crumbs crumbs={crumbs} />
        </div>
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
    </section>
  );
}
