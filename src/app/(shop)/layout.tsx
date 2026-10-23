import { ViewTransition } from "react";
import { ShopChrome } from "@/components/shop/chrome";

// Page swaps cross-fade (globals.css "Motion", .hh-page: only with html.motion; instant otherwise). One element inside, so
// a page that renders siblings never gets two nodes with the same transition name.
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopChrome>
      <ViewTransition default="hh-page">
        <div>{children}</div>
      </ViewTransition>
    </ShopChrome>
  );
}
