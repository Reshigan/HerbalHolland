import { ViewTransition } from "react";
import { ShopChrome } from "@/components/shop/chrome";

// Page swaps cross-fade (globals.css "Motion", .hh-page: only with html.motion; instant otherwise).
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopChrome>
      <ViewTransition default="hh-page">{children}</ViewTransition>
    </ShopChrome>
  );
}
