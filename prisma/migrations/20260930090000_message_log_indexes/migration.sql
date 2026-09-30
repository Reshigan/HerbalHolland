-- CreateIndex
CREATE INDEX "MessageLog_createdAt_idx" ON "MessageLog"("createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_channel_status_createdAt_idx" ON "MessageLog"("channel", "status", "createdAt");

