-- The merch parcel's courier and tracking number (it ships separately from stocked items).
ALTER TABLE "Order" ADD COLUMN "podTracking" TEXT;
