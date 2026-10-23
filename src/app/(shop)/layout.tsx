import { ShopChrome } from "@/components/shop/chrome";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopChrome>
      {children}
    </ShopChrome>
  );
}
