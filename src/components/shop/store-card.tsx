import Link from "next/link";
import {
  Clock,
  Navigation,
  Phone,
  Pill,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { openState, parseHours } from "@/server/shop/hours";
import { shopPhase } from "@/server/shop/context";
import { canBuyOnline } from "@/lib/launch-phase";
import type { ShopStore } from "@/server/shop/context";
import { SetStoreButton } from "./set-store-button";
import { Panel, Tag } from "./ui";
import { cn } from "@/lib/cn";
import { asList } from "@/lib/json-list";

export const directionsUrl = (
  s: Pick<ShopStore, "lat" | "lng" | "addressLine" | "suburb" | "city">,
) =>
  s.lat != null && s.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Herbal Holland ${[s.addressLine, s.suburb, s.city].filter(Boolean).join(", ")}`)}`;

export async function StoreServices({
  s,
  className,
}: {
  s: Pick<ShopStore, "clickCollect" | "sameDay" | "licences">;
  className?: string;
}) {
  const online = canBuyOnline(await shopPhase());
  return (
    <ul
      className={cn("flex flex-wrap gap-1.5", className)}
      aria-label="Services"
    >
      {online && s.clickCollect && (
        <li>
          <Tag icon={<ShoppingBag className="h-3 w-3" />}>
            Click &amp; collect
          </Tag>
        </li>
      )}
      {online && s.sameDay && (
        <li>
          <Tag icon={<Truck className="h-3 w-3" />}>Same-day delivery</Tag>
        </li>
      )}
      {asList(s.licences).length > 0 && (
        <li>
          <Tag icon={<Pill className="h-3 w-3" />}>Dispensary</Tag>
        </li>
      )}
    </ul>
  );
}

export function StoreCard({
  s,
  preferred,
  km,
  className,
}: {
  s: ShopStore;
  preferred?: boolean;
  km?: number | null;
  className?: string;
}) {
  const soon = s.status !== "ACTIVE";
  const o = openState(parseHours(s.hours));
  return (
    <Panel
      className={cn(
        "flex flex-col p-5",
        preferred && "border-brand-500/60 bg-brand-500/[0.04]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-white">
            <Link href={`/stores/${s.slug}`} className="hover:text-brand-300">
              Herbal Holland {s.name}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-ink-400">
            {[s.addressLine, s.suburb, s.city].filter(Boolean).join(", ")}
            {km != null && (
              <span className="text-ink-450">
                {" "}
                · {km < 10 ? km.toFixed(1) : Math.round(km)} km
              </span>
            )}
          </p>
        </div>
        {soon ? (
          <Tag tone="amber">Opening soon</Tag>
        ) : o.unknown ? (
          <Tag tone="green">Open</Tag>
        ) : (
          <Tag tone={o.open ? "green" : "neutral"}>
            {o.open ? "Open now" : "Closed"}
          </Tag>
        )}
      </div>
      {!soon && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-300">
          <Clock className="h-4 w-4 text-ink-450" />
          {o.label}
          {s.format === "FLAGSHIP" && (
            <Tag tone="orange" className="ml-auto">
              Flagship
            </Tag>
          )}
        </p>
      )}
      {!soon && <StoreServices s={s} className="mt-3" />}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        {!soon && (
          <SetStoreButton code={s.code} name={s.name} active={preferred} />
        )}
        <a
          href={directionsUrl(s)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-700 px-3.5 text-xs font-semibold text-ink-100 hover:border-ink-500"
        >
          <Navigation className="h-3.5 w-3.5" /> Directions
        </a>
        {s.phone && !soon && (
          <a
            href={`tel:${s.phone.replace(/\s/g, "")}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-700 px-3.5 text-xs font-semibold text-ink-100 hover:border-ink-500"
          >
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        )}
      </div>
    </Panel>
  );
}
