import Link from "next/link";
import { Lockup } from "@/components/brand/logo";
import { DEMO_PASSWORD } from "@/lib/password";
import { LoginForm, DemoLogin } from "./login-form";

export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

const DEMO = [
  { email: "hq@herbalholland.co.za", label: "HQ administrator", sub: "Network, catalogue, marketing, compliance" },
  { email: "area.gpn@herbalholland.co.za", label: "Area manager", sub: "Tshwane & North region" },
  { email: "thabo@mokoenaretail.co.za", label: "Franchise owner", sub: "Mokoena Retail · Hatfield & Brooklyn" },
  { email: "books@mokoenaretail.co.za", label: "Accountant", sub: "Mokoena Retail's books" },
  { email: "manager.pta01@herbalholland.co.za", label: "Store manager", sub: "Hatfield · responsible dispenser" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string }> }) {
  const sp = await searchParams;
  const demo = process.env.DEMO_MODE === "true";
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink-950 p-12 text-ink-100 lg:flex lg:flex-col lg:justify-between">
        <div className="eyebrow text-brand-500">Herbal Holland platform</div>
        <div className="hh-frame mx-auto flex aspect-[4/5] w-full max-w-md items-center justify-center rounded-md p-10">
          <Lockup spin className="h-full w-full text-[2.6rem] [&>svg]:h-[52%]" />
        </div>
        <p className="max-w-md font-display text-2xl font-light leading-snug text-ink-200">
          One platform for every store, from Hatfield to Sea Point: <span className="font-semibold text-white">tills, stock, buying, money and members</span>.
        </p>
      </section>
      <section className="flex items-center justify-center bg-ink-50 px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-semibold text-ink-950">Sign in</h1>
          <p className="mb-6 mt-1 text-sm text-ink-500">Back office and HQ console. Budtenders sign in at the till with their PIN.</p>
          {sp.denied && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">Your account doesn&apos;t have access to that page.</p>}
          <LoginForm next={sp.next} />
          <div className="mt-6 flex justify-between text-sm">
            <Link href="/pos" className="font-medium text-brand-700 hover:underline">Open the POS →</Link>
            <Link href="/" className="text-ink-500 hover:text-ink-800">Shop</Link>
          </div>
          {demo && (
            <div className="mt-10">
              <div className="eyebrow mb-2 text-ink-400">Demo access · password “{DEMO_PASSWORD}”</div>
              <div className="grid gap-2">
                {DEMO.map((d) => (
                  <DemoLogin key={d.email} {...d} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
