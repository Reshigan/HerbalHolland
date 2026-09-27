-- Made-to-order merch: variants printed on demand by the print partner, and the partner's order on each order.
ALTER TABLE "Variant" ADD COLUMN "podSku" TEXT;
ALTER TABLE "Order" ADD COLUMN "podRef" TEXT;
ALTER TABLE "Order" ADD COLUMN "podStatus" TEXT;
