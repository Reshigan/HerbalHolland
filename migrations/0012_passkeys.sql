-- Members' passkeys: fingerprint or face sign-in in the app and the PWA.
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "alg" INTEGER NOT NULL DEFAULT -7,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    CONSTRAINT "Passkey_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Passkey_customerId_idx" ON "Passkey"("customerId");
