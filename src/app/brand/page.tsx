import { Lockup, Logo, Mark, Wordmark } from "@/components/brand/logo";

export const metadata = { title: "Brand" };

export default function BrandPage() {
  return (
    <main className="min-h-screen bg-ink-950 p-10 text-ink-100">
      <div className="grid gap-10 md:grid-cols-2">
        <div className="hh-frame flex aspect-[4/5] items-center justify-center p-10">
          <Lockup className="h-full w-full text-[3.2rem] [&>svg]:h-[55%]" />
        </div>
        <div className="space-y-8">
          <div className="flex items-end gap-6 text-oranje-500">
            <Mark className="h-40 w-40" />
            <Mark className="h-20 w-20" />
            <Mark className="h-10 w-10" detail={false} />
            <Mark className="h-6 w-6" detail={false} />
          </div>
          <Logo />
          <div className="rounded-3xl bg-oranje-500 p-8 text-ink-950">
            <Wordmark className="text-5xl" />
          </div>
        </div>
      </div>
    </main>
  );
}
