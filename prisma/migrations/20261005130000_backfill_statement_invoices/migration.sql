-- Stock orders received before they were put on the supplier invoices automatically: each goes on its buyer's
-- supplier invoices as recordStatementInvoice does (for what was received, VAT on top, due on the month's last day,
-- SAST), already settled when its month is over (as the daily job does), audited as the system. Runs once on deploy.
WITH received AS (
  SELECT o.id, o.number, o."buyerId", o."createdById", o."receivedAt", s.name AS seller,
    ((o."receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Johannesburg')::date AS day,
    SUM(COALESCE(l."receivedQty", 0) * l."unitCostCents")::int AS ex
  FROM "StockOrder" o
  JOIN "Store" s ON s.id = o."sellerId"
  JOIN "StockOrderLine" l ON l."stockOrderId" = o.id
  WHERE o.status = 'RECEIVED' AND o."receivedAt" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "SupplierInvoice" i WHERE i."stockOrderId" = o.id)
  GROUP BY o.id, s.name
), terms AS (
  SELECT r.*, ROUND(r.ex * 0.15)::int AS vat, date_trunc('month', r.day)::date AS month, to_char(r.day, 'FMMonth YYYY') AS label,
    r.day < date_trunc('month', now() AT TIME ZONE 'Africa/Johannesburg')::date AS settled
  FROM received r
  WHERE r.ex > 0
), inserted AS (
  INSERT INTO "SupplierInvoice" (id, "storeId", "supplierName", number, "invoiceDate", "dueDate", "totalCents", "vatCents", "stockOrderId", "onStatement", status, "paidAt", note, "createdById", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, t."buyerId", t.seller, t.number, t.day, (t.month + interval '1 month - 1 day')::date, t.ex + t.vat, t.vat, t.id, true,
    (CASE WHEN t.settled THEN 'PAID' ELSE 'DUE' END)::"SupplierInvoiceStatus",
    CASE WHEN t.settled THEN ((t.month + interval '1 month') AT TIME ZONE 'Africa/Johannesburg') AT TIME ZONE 'UTC' END,
    (CASE WHEN t.settled THEN 'Settled' ELSE 'Settles' END) || ' on the ' || t.label || ' franchise statement',
    COALESCE(t."createdById", 'system'), t."receivedAt", now() AT TIME ZONE 'UTC'
  FROM terms t
  RETURNING id, "storeId", "supplierName", number, "totalCents", "vatCents", "stockOrderId"
)
INSERT INTO "AuditLog" (id, at, "actorType", "actorName", "storeId", action, entity, "entityId", data)
SELECT gen_random_uuid()::text, now() AT TIME ZONE 'UTC', 'SYSTEM', 'System', i."storeId", 'supplier_invoice.create', 'SupplierInvoice', i.id,
  jsonb_build_object('supplierName', i."supplierName", 'number', i.number, 'totalCents', i."totalCents", 'vatCents', i."vatCents", 'stockOrderId', i."stockOrderId", 'onStatement', true, 'backfill', true)
FROM inserted i;
