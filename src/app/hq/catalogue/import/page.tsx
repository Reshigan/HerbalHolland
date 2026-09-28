import { notFound, redirect } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { qs } from "@/server/hq/form";
import { importLocations, importOf, loadImportFile, previewImport } from "@/server/hq/catalogue-import";
import { IMPORT_COLUMNS, IMPORT_MAX_BYTES, planDigest, type ImportCounts, type RowAction } from "@/lib/catalogue-import";
import { fmtDateTime, num } from "@/lib/format";
import { zar } from "@/lib/money";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ActionForm, SubmitButton } from "@/components/hq/action-form";
import { FilterForm } from "@/components/hq/filter-form";
import { Select } from "@/components/ui/form";
import { BackLink, EmptyRow } from "@/components/hq/ui";
import { Flash } from "@/components/hq/flash";
import { importCatalogue, uploadCatalogue } from "./actions";
import { UploadForm } from "./upload-form";

export const metadata = { title: "Import catalogue" };

type SP = { file?: string; at?: string; show?: string; page?: string; m?: string };
const PATH = "/hq/catalogue/import";
const PAGE_SIZE = 50;
const SHOW: { key: RowAction | "all"; label: string; count: (c: ImportCounts) => number }[] = [
  { key: "all", label: "All rows", count: (c) => c.rows },
  { key: "create", label: "New", count: (c) => c.create },
  { key: "update", label: "Updates", count: (c) => c.update },
  { key: "unchanged", label: "Unchanged", count: (c) => c.unchanged },
  { key: "error", label: "Errors", count: (c) => c.errors },
];
const RESULT: Record<RowAction, [string, Tone]> = { create: ["New", "green"], update: ["Update", "blue"], unchanged: ["Unchanged", "neutral"], error: ["Error", "red"] };
const plural = (n: number, one: string) => `${num(n)} ${one}${n === 1 ? "" : "s"}`;

export default async function ImportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  if (!can(user, "network")) redirect("/hq/catalogue");
  const locations = await importLocations(await scopedStoreIds(scopeOf(user)));
  const at = locations.find((l) => l.id === sp.at) ?? null;
  const template = (
    <a href={`${PATH}/template`} download className={buttonClass("outline")}>
      <Download className="h-4 w-4" aria-hidden /> Download the template
    </a>
  );

  if (!sp.file)
    return (
      <>
        <BackLink href="/hq/catalogue">Catalogue</BackLink>
        <PageHeader overline="Product" title="Import catalogue" description="Load products, variants and prices from a spreadsheet, with opening stock if you have it. You see exactly what will change before anything does." actions={template} />
        <Flash message={sp.m} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="min-w-0 xl:col-span-2">
            <CardHeader title="Upload a spreadsheet" description="Checking the file changes nothing: the next page shows what each row would do." />
            <CardBody>
              <UploadForm action={uploadCatalogue} maxBytes={IMPORT_MAX_BYTES} locations={locations.map((l) => ({ id: l.id, kind: l.kind, label: `${l.name} (${l.code})` }))} />
            </CardBody>
          </Card>
          <Card className="self-start">
            <CardHeader title="How it works" />
            <CardBody>
              <ol className="list-decimal space-y-2.5 pl-4 text-sm text-ink-600 marker:font-semibold marker:text-brand-700">
                <li>Fill in the template, one row per SKU. Rows with the same product name are one product; after its first row, a product&apos;s details can be left empty.</li>
                <li>Upload it and check every row: new, updated, unchanged or an error, and why.</li>
                <li>Import. Rows with errors are skipped: fix them and upload the file again — what&apos;s already in shows as unchanged.</li>
              </ol>
              <ul className="mt-4 space-y-2 rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-600">
                <li>Prices are in rand: RRP including VAT; wholesale and cost excluding VAT.</li>
                <li>Categories are matched by name and must exist first. New products start in draft.</li>
                <li>Every product meets its class&apos;s rules and copy screening, as in the product form.</li>
                <li>Opening stock is received into a batch at the location you choose (at HQ cost in a warehouse, wholesale in a store), with the reason Correction.</li>
              </ul>
            </CardBody>
          </Card>
        </div>
        <Card className="mt-6">
          <details>
            <summary className="cursor-pointer px-5 py-4 font-display text-sm font-semibold text-ink-900">The columns ({IMPORT_COLUMNS.length})</summary>
            <Table>
              <thead>
                <tr>
                  <Th>Column</Th>
                  <Th>What goes in it</Th>
                </tr>
              </thead>
              <tbody>
                {IMPORT_COLUMNS.map((c) => (
                  <Tr key={c.key}>
                    <Td className="whitespace-nowrap">
                      <span className="font-mono text-[0.8rem] text-ink-900">{c.key}</span> {c.required && <Badge tone="orange">Required</Badge>}
                    </Td>
                    <Td className="text-ink-600">{c.about}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </details>
        </Card>
      </>
    );

  const file = await loadImportFile(sp.file);
  if (!file) notFound();
  const [{ plan, location }, done, by] = await Promise.all([
    previewImport(file.text, at?.id ?? null),
    importOf(file.upload.id),
    file.upload.uploadedById ? db.user.findUnique({ where: { id: file.upload.uploadedById }, select: { name: true } }) : null,
  ]);
  const c = plan.counts;
  const show = SHOW.find((s) => s.key === sp.show)?.key ?? "all";
  const rows = show === "all" ? plan.rows : plan.rows.filter((r) => r.action === show);
  const page = pageParam(sp.page);
  const href = (p: Record<string, string | number | undefined>) => `${PATH}${qs({ file: sp.file, at: at?.id, show: show === "all" ? undefined : show, ...p })}`;
  const writes = c.productsNew + c.productsUpdated + c.variantsNew + c.variantsUpdated + c.stockLines;
  const will = [
    c.productsNew && `creates ${plural(c.productsNew, "product")}`,
    c.variantsNew && `adds ${plural(c.variantsNew, "variant")}`,
    (c.productsUpdated || c.variantsUpdated) && `updates ${[c.productsUpdated && plural(c.productsUpdated, "product"), c.variantsUpdated && plural(c.variantsUpdated, "variant")].filter(Boolean).join(" and ")}`,
    c.stockLines && location && `receives ${plural(c.stockUnits, "unit")} of opening stock at ${location.name}`,
  ].filter(Boolean);

  return (
    <>
      <BackLink href="/hq/catalogue">Catalogue</BackLink>
      <PageHeader
        overline="Product · import"
        title={file.upload.fileName}
        description={`${plural(c.rows, "row")} · uploaded${by ? ` by ${by.name}` : ""} ${fmtDateTime(file.upload.createdAt)}`}
        actions={
          <>
            {template}
            <ButtonLink href={PATH} variant="outline">
              <Upload className="h-4 w-4" /> Upload another file
            </ButtonLink>
          </>
        }
      />
      <Flash message={sp.m} />
      {done && (
        <Notice tone="success" className="mb-6" title={`Imported ${fmtDateTime(done.at)}${done.actorName ? ` by ${done.actorName}` : ""}`}>
          The rows below compare the file with the catalogue as it is now.
        </Notice>
      )}
      {plan.fileErrors.length > 0 && (
        <Notice tone="danger" className="mb-6" title="This file can't be imported yet">
          <ul className="list-disc space-y-0.5 pl-5">
            {plan.fileErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}
      {plan.warnings.map((w) => (
        <Notice key={w} tone="warn" className="mb-6">
          {w}
        </Notice>
      ))}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="New" value={num(c.create)} sub={plural(c.productsNew, "new product")} />
        <Stat label="Updates" value={num(c.update)} sub={plural(c.prices, "price change")} />
        <Stat label="Unchanged" value={num(c.unchanged)} />
        <Stat label="Errors" value={num(c.errors)} sub={c.errors ? "skipped on import" : "none"} />
        <Stat label="Opening stock" value={num(c.stockUnits)} sub={location && c.stockUnits ? `${zar(c.stockValueCents)} at cost` : "units"} />
      </div>

      {!done && (
        <Card className="mb-6">
          <CardBody className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 space-y-3">
              <FilterForm action={PATH} keep={{ file: sp.file, show: show === "all" ? undefined : show }}>
                <label htmlFor="stock-at" className="self-center text-sm font-medium text-ink-700">
                  Opening stock at
                </label>
                <Select id="stock-at" name="at" defaultValue={at?.id ?? ""} wrapperClassName="w-80 max-w-full">
                  <option value="">None</option>
                  {(["WAREHOUSE", "RETAIL"] as const).map((k) => (
                    <optgroup key={k} label={k === "WAREHOUSE" ? "Warehouses" : "Stores"}>
                      {locations.filter((l) => l.kind === k).map((l) => (
                        <option key={l.id} value={l.id}>{`${l.name} (${l.code})`}</option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </FilterForm>
              <p className="text-sm text-ink-600">
                {plan.fileErrors.length ? "Fix the file, then upload it again." : writes ? `Importing ${will.join(", ")}.${c.errors ? ` ${plural(c.errors, "row")} with errors will be skipped.` : ""}` : "Nothing to import: every row is unchanged or has an error."}
              </p>
            </div>
            <ActionForm action={importCatalogue.bind(null, file.upload.id)} className="shrink-0" notices="bottom">
              <input type="hidden" name="at" value={at?.id ?? ""} />
              <input type="hidden" name="digest" value={planDigest(c)} />
              <SubmitButton size="lg" disabled={!writes || plan.fileErrors.length > 0} pendingLabel="Importing…">
                <FileSpreadsheet className="h-4 w-4" /> Import
              </SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      )}

      <Card>
        <TabLinks className="px-4 pt-1" current={href({})} tabs={SHOW.map((s) => ({ href: `${PATH}${qs({ file: sp.file, at: at?.id, show: s.key === "all" ? undefined : s.key })}`, label: s.label, count: s.count(c) }))} />
        <Table>
          <thead>
            <tr>
              <Th align="right" className="w-14">Row</Th>
              <Th>SKU</Th>
              <Th>Product</Th>
              <Th>Result</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={5}>No rows here.</EmptyRow>}
            {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (
              <Tr key={r.line}>
                <Td align="right" className="tnum text-ink-500">{r.line}</Td>
                <Td className="whitespace-nowrap font-mono text-[0.8rem] text-ink-900">{r.sku || "—"}</Td>
                <Td className="min-w-48">
                  <span className="block font-medium text-ink-900">{r.product || "—"}</span>
                  <span className="text-xs text-ink-500">{r.variant}</span>
                </Td>
                <Td>
                  <Badge tone={RESULT[r.action][1]} dot>{RESULT[r.action][0]}</Badge>
                </Td>
                <Td className="min-w-72 text-xs">
                  {r.errors.map((e) => (
                    <p key={e} className="font-medium text-rose-600">{e}</p>
                  ))}
                  {r.notes.map((n) => (
                    <p key={n} className="text-ink-600">{n}</p>
                  ))}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
