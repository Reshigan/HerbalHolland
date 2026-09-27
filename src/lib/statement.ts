// Monthly franchise statement between HQ and a store owner.
// Positive net = HQ pays the store; negative = the store pays HQ.
import { applyBps, vatOnExcl } from "./money";

export type StatementInput = {
  netSalesExVatCents: number; // all channels
  onlineSalesExVatCents: number; // online orders fulfilled by the store
  onlineCollectedCents: number; // paid online, collected by HQ on the store's behalf
  pointsIssuedCents: number; // value of points the store issued
  pointsRedeemedCents: number; // value of points redeemed at the store
  wholesaleCents: number; // stock bought from HQ DCs on account (VAT incl.)
  networkSoldCents: number; // stock sold to other stores (VAT incl.)
  networkBoughtCents: number; // stock bought from other stores (VAT incl.)
  royaltyBps: number;
  levyBps: number;
  ecomBps: number;
};

export type StatementLine = { label: string; detail: string; cents: number; kind: "credit" | "debit" };

export function buildStatement(i: StatementInput) {
  const royalty = applyBps(i.netSalesExVatCents, i.royaltyBps);
  const levy = applyBps(i.netSalesExVatCents, i.levyBps);
  const ecom = applyBps(i.onlineSalesExVatCents, i.ecomBps);
  const fees = royalty + levy + ecom;
  const feesVat = vatOnExcl(fees);
  const lines: StatementLine[] = [
    { label: "Online sales collected by HQ", detail: "Paid online, fulfilled by your store", cents: i.onlineCollectedCents, kind: "credit" },
    { label: "Points redeemed in store", detail: "Reimbursed from the network loyalty pool", cents: i.pointsRedeemedCents, kind: "credit" },
    { label: "Stock sold to network stores", detail: "Network trading, cleared by HQ", cents: i.networkSoldCents, kind: "credit" },
    { label: "Royalty", detail: `${i.royaltyBps / 100}% of net sales`, cents: royalty, kind: "debit" },
    { label: "Marketing fund levy", detail: `${i.levyBps / 100}% of net sales`, cents: levy, kind: "debit" },
    { label: "E-commerce commission", detail: `${i.ecomBps / 100}% of online sales`, cents: ecom, kind: "debit" },
    { label: "VAT on fees", detail: "15% on royalty, levy and commission", cents: feesVat, kind: "debit" },
    { label: "Points issued", detail: "Funds the network loyalty pool", cents: i.pointsIssuedCents, kind: "debit" },
    { label: "Wholesale stock on account", detail: "Received from HQ distribution centres", cents: i.wholesaleCents, kind: "debit" },
    { label: "Stock bought from network stores", detail: "Network trading, cleared by HQ", cents: i.networkBoughtCents, kind: "debit" },
  ];
  const credits = lines.filter((l) => l.kind === "credit").reduce((s, l) => s + l.cents, 0);
  const debits = lines.filter((l) => l.kind === "debit").reduce((s, l) => s + l.cents, 0);
  return { lines, credits, debits, net: credits - debits, royalty, levy, ecom, feesVat };
}
