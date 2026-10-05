-- A lot whose cost re-averages on receiving changes value by more than the movement; the books need the difference.
ALTER TABLE "StockMovement" ADD COLUMN "revalueCents" INTEGER NOT NULL DEFAULT 0;
