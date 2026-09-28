-- Sign-up trends (HQ → Launch) read members by join date.
CREATE INDEX "Customer_createdAt_idx" ON "Customer"("createdAt");
