-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "regNumber" TEXT,
    "vatNumber" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "directors" TEXT,
    "booksLockedThrough" TEXT,
    "vatCategory" TEXT,
    "yearEndMonth" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'RETAIL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "format" TEXT NOT NULL DEFAULT 'STANDARD',
    "companyId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "dcId" TEXT,
    "addressLine" TEXT NOT NULL,
    "suburb" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "lat" REAL,
    "lng" REAL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "hours" JSONB,
    "clickCollect" BOOLEAN NOT NULL DEFAULT true,
    "payshapId" TEXT,
    "sameDay" BOOLEAN NOT NULL DEFAULT false,
    "licences" JSONB NOT NULL DEFAULT '[]',
    "licenceRef" TEXT,
    "royaltyBps" INTEGER NOT NULL DEFAULT 600,
    "levyBps" INTEGER NOT NULL DEFAULT 200,
    "ecomBps" INTEGER NOT NULL DEFAULT 1000,
    "receiptFooter" TEXT,
    "commissionOn" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Store_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Store_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Store_dcId_fkey" FOREIGN KEY ("dcId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "tempPasswordUntil" DATETIME,
    "pinHash" TEXT,
    "passwordFails" INTEGER NOT NULL DEFAULT 0,
    "passwordLockedAt" DATETIME,
    "pinFails" INTEGER NOT NULL DEFAULT 0,
    "pinLockedAt" DATETIME,
    "pinDisabledAt" DATETIME,
    "canDispense" BOOLEAN NOT NULL DEFAULT false,
    "memberId" TEXT,
    "role" TEXT NOT NULL,
    "companyId" TEXT,
    "storeId" TEXT,
    "regionId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "customerId" TEXT,
    "storeId" TEXT,
    "deviceId" TEXT,
    "tradeBuyerId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_tradeBuyerId_fkey" FOREIGN KEY ("tradeBuyerId") REFERENCES "TradeBuyer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "tokenHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Device_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blurb" TEXT,
    "icon" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "brand" TEXT NOT NULL DEFAULT 'Herbal Holland',
    "line" TEXT,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "strain" TEXT,
    "thcMin" REAL,
    "thcMax" REAL,
    "cbdMin" REAL,
    "cbdMax" REAL,
    "terpenes" JSONB,
    "effects" JSONB NOT NULL DEFAULT '[]',
    "flavours" JSONB NOT NULL DEFAULT '[]',
    "lineage" TEXT,
    "origin" TEXT,
    "heritage" BOOLEAN NOT NULL DEFAULT false,
    "regClass" TEXT NOT NULL,
    "legalBasis" TEXT,
    "cbdMgPerPack" INTEGER,
    "cbdMgPerDay" REAL,
    "claims" JSONB NOT NULL DEFAULT '[]',
    "netContent" REAL,
    "netUnit" TEXT,
    "ingredients" TEXT,
    "allergens" JSONB NOT NULL DEFAULT '[]',
    "naturalCbd" BOOLEAN NOT NULL DEFAULT false,
    "tobaccoRelated" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "grams" REAL,
    "priceCents" INTEGER NOT NULL,
    "wholesaleCents" INTEGER NOT NULL,
    "caseQty" INTEGER NOT NULL DEFAULT 1,
    "costCents" INTEGER NOT NULL,
    "podSku" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "packedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME,
    "thc" REAL,
    "cbd" REAL,
    "labName" TEXT,
    "coaRef" TEXT,
    "labResults" JSONB,
    "status" TEXT NOT NULL DEFAULT 'RELEASED',
    "statusReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Batch_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "unitCostCents" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StockLevel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLevel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLevel_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreVariant" (
    "storeId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "priceCents" INTEGER,
    "reorderPoint" INTEGER NOT NULL DEFAULT 4,
    "parLevel" INTEGER NOT NULL DEFAULT 12,

    PRIMARY KEY ("storeId", "variantId"),
    CONSTRAINT "StoreVariant_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StoreVariant_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "unitCostCents" INTEGER NOT NULL,
    "revalueCents" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "saleId" TEXT,
    "orderId" TEXT,
    "stockOrderId" TEXT,
    "stockTakeId" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockTake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "blind" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'COUNTING',
    "createdById" TEXT,
    "approvedById" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    CONSTRAINT "StockTake_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockTakeLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockTakeId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "expectedQty" INTEGER NOT NULL,
    "countedQty" INTEGER,
    "varianceQty" INTEGER,
    "unitCostCents" INTEGER NOT NULL,
    CONSTRAINT "StockTakeLine_stockTakeId_fkey" FOREIGN KEY ("stockTakeId") REFERENCES "StockTake" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockTakeLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    "approvedAt" DATETIME,
    "shippedAt" DATETIME,
    "receivedAt" DATETIME,
    "invoiceSentAt" DATETIME,
    CONSTRAINT "StockOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockOrderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "shipped" JSONB,
    "receivedQty" INTEGER,
    CONSTRAINT "StockOrderLine_stockOrderId_fkey" FOREIGN KEY ("stockOrderId") REFERENCES "StockOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Listing_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Listing_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberNo" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "dob" DATETIME,
    "idHash" TEXT,
    "idLast4" TEXT,
    "ageVerifiedAt" DATETIME,
    "ageCheck" TEXT NOT NULL DEFAULT 'NONE',
    "tier" TEXT NOT NULL DEFAULT 'SEED',
    "tierFloor" TEXT,
    "tierFloorUntil" DATETIME,
    "foundingNo" INTEGER,
    "personalisedOffers" BOOLEAN NOT NULL DEFAULT true,
    "homeStoreId" TEXT,
    "referralCode" TEXT NOT NULL,
    "referredById" TEXT,
    "consentWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "consentSms" BOOLEAN NOT NULL DEFAULT false,
    "consentEmail" BOOLEAN NOT NULL DEFAULT false,
    "consentPush" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" DATETIME,
    "source" TEXT,
    "joinedVia" TEXT,
    "termsVersion" TEXT,
    "termsAcceptedAt" DATETIME,
    "interests" JSONB NOT NULL DEFAULT '[]',
    "points" INTEGER NOT NULL DEFAULT 0,
    "lifetimeCents" INTEGER NOT NULL DEFAULT 0,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "firstPurchaseAt" DATETIME,
    "lastPurchaseAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME,
    CONSTRAINT "Customer_homeStoreId_fkey" FOREIGN KEY ("homeStoreId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoyaltyEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT,
    "points" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "saleId" TEXT,
    "orderId" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoyaltyEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PatientAuth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "authNumber" TEXT NOT NULL,
    "prescriber" TEXT NOT NULL,
    "prescriberRegNo" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "monthlyLimitGrams" REAL NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "documentRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "verifiedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientAuth_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "wording" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsentEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "channel" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Otp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT,
    "email" TEXT,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Throttle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "gateway" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("gateway", "eventId")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "deviceId" TEXT,
    "openedById" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingFloatCents" INTEGER NOT NULL,
    "closedById" TEXT,
    "closedAt" DATETIME,
    "expectedCashCents" INTEGER,
    "countedCashCents" INTEGER,
    "notes" TEXT,
    "depositId" TEXT,
    CONSTRAINT "Shift_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shift_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "CashDeposit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SALE',
    "refundOfId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'POS',
    "orderId" TEXT,
    "storeId" TEXT NOT NULL,
    "shiftId" TEXT,
    "staffId" TEXT,
    "soldById" TEXT,
    "deviceId" TEXT,
    "customerId" TEXT,
    "tradeAccountId" TEXT,
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "memberSavingsCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "promoCode" TEXT,
    "promotionId" TEXT,
    "campaignId" TEXT,
    "ageCheck" TEXT NOT NULL DEFAULT 'NONE',
    "buyer" JSONB,
    "invoiceEmail" TEXT,
    "invoiceSentAt" DATETIME,
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SaleLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "memberSavingsCents" INTEGER NOT NULL DEFAULT 0,
    "offerCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,
    "allocations" JSONB NOT NULL,
    CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SaleLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "tenderedCents" INTEGER,
    "changeCents" INTEGER,
    "provider" TEXT,
    "reference" TEXT,
    "cardBrand" TEXT,
    "cardLast4" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLACED',
    "fulfilment" TEXT NOT NULL,
    "routingNote" TEXT,
    "addressLine" TEXT,
    "suburb" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "deliveryNotes" TEXT,
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "deliveryCents" INTEGER NOT NULL DEFAULT 0,
    "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "payMethod" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "paymentRef" TEXT,
    "collectionCode" TEXT NOT NULL,
    "idChecked" BOOLEAN NOT NULL DEFAULT false,
    "courier" TEXT,
    "trackingNo" TEXT,
    "podRef" TEXT,
    "podStatus" TEXT,
    "podTracking" TEXT,
    "promoCode" TEXT,
    "promotionId" TEXT,
    "campaignId" TEXT,
    "events" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "memberSavingsCents" INTEGER NOT NULL DEFAULT 0,
    "offerCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplier" TEXT,
    "amountCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT,
    "tiers" JSONB NOT NULL DEFAULT '[]',
    "storeIds" JSONB NOT NULL DEFAULT '[]',
    "regionIds" JSONB NOT NULL DEFAULT '[]',
    "adjustPct" REAL,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "priceListId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "categoryIds" JSONB NOT NULL DEFAULT '[]',
    "productIds" JSONB NOT NULL DEFAULT '[]',
    "minSpendCents" INTEGER NOT NULL DEFAULT 0,
    "buyQty" INTEGER,
    "getQty" INTEGER,
    "rewardPercent" INTEGER,
    "rewardCategoryIds" JSONB NOT NULL DEFAULT '[]',
    "rewardProductIds" JSONB NOT NULL DEFAULT '[]',
    "channels" JSONB NOT NULL DEFAULT '[]',
    "storeIds" JSONB NOT NULL DEFAULT '[]',
    "ownerStoreId" TEXT,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "days" JSONB NOT NULL DEFAULT '[]',
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxUses" INTEGER,
    "firstPurchaseOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "storeId" TEXT,
    "message" TEXT NOT NULL,
    "promotionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" DATETIME,
    "sentAt" DATETIME,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "audienceCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "suppressedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT,
    "customerId" TEXT,
    "to" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MessageLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" DATETIME,
    CONSTRAINT "StockAlert_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockAlert_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "photoUploadIds" JSONB NOT NULL DEFAULT '[]',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenReason" TEXT,
    "moderatedById" TEXT,
    "moderatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyStoreStat" (
    "storeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "channel" TEXT NOT NULL,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "refunds" INTEGER NOT NULL DEFAULT 0,
    "units" INTEGER NOT NULL DEFAULT 0,
    "grossCents" INTEGER NOT NULL DEFAULT 0,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "memberSavingsCents" INTEGER NOT NULL DEFAULT 0,
    "offerCents" INTEGER NOT NULL DEFAULT 0,
    "cardCents" INTEGER NOT NULL DEFAULT 0,
    "cashCents" INTEGER NOT NULL DEFAULT 0,
    "payshapCents" INTEGER NOT NULL DEFAULT 0,
    "eftCents" INTEGER NOT NULL DEFAULT 0,
    "loyaltyCents" INTEGER NOT NULL DEFAULT 0,
    "onlineCents" INTEGER NOT NULL DEFAULT 0,
    "accountCents" INTEGER NOT NULL DEFAULT 0,
    "members" INTEGER NOT NULL DEFAULT 0,
    "pointsIssued" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("storeId", "date", "channel"),
    CONSTRAINT "DailyStoreStat_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyVariantStat" (
    "storeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "variantId" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("storeId", "date", "variantId"),
    CONSTRAINT "DailyVariantStat_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "requiresAck" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AnnouncementAck" (
    "announcementId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("announcementId", "storeId"),
    CONSTRAINT "AnnouncementAck_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnnouncementAck_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "storeId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "data" JSONB
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" JSONB NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobRun" (
    "job" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME,
    "okAt" DATETIME,
    "failedAt" DATETIME,
    "error" TEXT
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Drop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blurb" TEXT NOT NULL,
    "variantIds" JSONB NOT NULL DEFAULT '[]',
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "earlyTier" TEXT,
    "earlyMinutes" INTEGER NOT NULL DEFAULT 0,
    "perMemberLimit" INTEGER NOT NULL DEFAULT 1,
    "membersOnly" BOOLEAN NOT NULL DEFAULT true,
    "notifiedEarlyAt" DATETIME,
    "notifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DropWatch" (
    "dropId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("dropId", "customerId"),
    CONSTRAINT "DropWatch_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DropWatch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blurb" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Rsvp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "checkedInAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Rsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "StoreEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Rsvp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemberOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "productIds" JSONB NOT NULL DEFAULT '[]',
    "categoryIds" JSONB NOT NULL DEFAULT '[]',
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "redeemedAt" DATETIME,
    "saleId" TEXT,
    "orderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberOffer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestCompletion" (
    "customerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("customerId", "key"),
    CONSTRAINT "QuestCompletion_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "image" TEXT,
    "channels" JSONB NOT NULL DEFAULT '[]',
    "mode" TEXT NOT NULL,
    "scheduledAt" DATETIME,
    "postizIds" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StudioPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playbook" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "storeId" TEXT,
    "productId" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioPlan_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudioPlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudioItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "short" TEXT,
    "card" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "link" TEXT,
    "releasedAt" DATETIME,
    "audience" TEXT,
    "linkedin" TEXT,
    "brief" TEXT,
    "hand" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "doneBy" TEXT,
    "doneAt" DATETIME,
    "socialPostId" TEXT,
    "campaignId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudioItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StudioPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudioItem_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudioItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storeId" TEXT,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CashDeposit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "bankedOn" DATETIME NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "expectedCents" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "slipId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    CONSTRAINT "CashDeposit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashDeposit_slipId_fkey" FOREIGN KEY ("slipId") REFERENCES "Upload" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "amountCents" INTEGER,
    "evidence" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "closedById" TEXT,
    "closedAt" DATETIME,
    "notifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Alert_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommissionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FranchiseLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "province" TEXT,
    "experience" TEXT NOT NULL,
    "capital" TEXT NOT NULL,
    "pharmacist" BOOLEAN NOT NULL,
    "message" TEXT,
    "source" TEXT,
    "ipHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "ownerId" TEXT,
    "notes" TEXT,
    "disclosureSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "orderCode" TEXT,
    "storeId" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "assignedToId" TEXT,
    "firstResponseDueAt" DATETIME NOT NULL,
    "firstRespondedAt" DATETIME,
    "resolveDueAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "ipHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "attachmentUploadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "note" TEXT,
    "photoUploadIds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "courier" TEXT,
    "waybill" TEXT,
    "refundCents" INTEGER,
    "refundRef" TEXT,
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StaffPushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME
);

-- CreateTable
CREATE TABLE "StaffPushEvent" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "uploadId" TEXT,
    "stockOrderId" TEXT,
    "accountId" TEXT,
    "onStatement" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "paidAt" DATETIME,
    "paidById" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StoreTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dueAt" DATETIME,
    "doneAt" DATETIME,
    "doneById" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScheduledExport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "cadence" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "recipients" JSONB NOT NULL DEFAULT '[]',
    "lastRunAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Home',
    "line" TEXT NOT NULL,
    "suburb" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Wishlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "outOfStockAt" DATETIME,
    "restockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GiftVoucher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "purchasedByCustomerId" TEXT,
    "purchaseOrderId" TEXT,
    "recipientEmail" TEXT,
    "recipientName" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "issuedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "redeemedOrderIds" JSONB NOT NULL DEFAULT '[]',
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VoucherRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "voucherId" TEXT NOT NULL,
    "orderId" TEXT,
    "saleId" TEXT,
    "cents" INTEGER NOT NULL,
    "reversed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReorderReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "everyDays" INTEGER NOT NULL,
    "nextAt" DATETIME NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "lastSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TradeAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'RETAILER',
    "regNumber" TEXT,
    "vatNumber" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "addressLine" TEXT NOT NULL,
    "suburb" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "deliveryLine" TEXT,
    "deliverySuburb" TEXT,
    "deliveryCity" TEXT,
    "deliveryProvince" TEXT,
    "deliveryPostalCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "terms" TEXT NOT NULL DEFAULT 'PREPAID',
    "paymentDays" INTEGER NOT NULL DEFAULT 30,
    "creditLimitCents" INTEGER NOT NULL DEFAULT 0,
    "classes" JSONB NOT NULL DEFAULT '[]',
    "priceListId" TEXT,
    "dcId" TEXT,
    "notes" TEXT,
    "adultAttestedAt" DATETIME,
    "termsVersion" TEXT,
    "termsAcceptedAt" DATETIME,
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "holdReason" TEXT,
    "ipHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TradeAccount_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeCart" (
    "tradeAccountId" TEXT NOT NULL PRIMARY KEY,
    "items" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TradeCart_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeBuyer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'BUYER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSignInAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeBuyer_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "tradeAccountId" TEXT NOT NULL,
    "buyerId" TEXT,
    "storeId" TEXT NOT NULL,
    "fulfilment" TEXT NOT NULL DEFAULT 'COURIER',
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "payMethod" TEXT NOT NULL,
    "paymentRef" TEXT,
    "paidAt" DATETIME,
    "subtotalCents" INTEGER NOT NULL,
    "deliveryCents" INTEGER NOT NULL DEFAULT 0,
    "handlingCents" INTEGER NOT NULL DEFAULT 0,
    "vatCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "addressLine" TEXT,
    "suburb" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "collectionCode" TEXT,
    "readyAt" DATETIME,
    "collectedAt" DATETIME,
    "reference" TEXT,
    "notes" TEXT,
    "courier" TEXT,
    "trackingNo" TEXT,
    "invoiceNumber" TEXT,
    "saleId" TEXT,
    "events" JSONB NOT NULL,
    "reservedAt" DATETIME,
    "shippedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TradeOrder_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TradeOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "TradeBuyer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TradeOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TradeOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeOrderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "shippedQty" INTEGER,
    "shipped" JSONB,
    CONSTRAINT "TradeOrderLine_tradeOrderId_fkey" FOREIGN KEY ("tradeOrderId") REFERENCES "TradeOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeAccountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cents" INTEGER NOT NULL,
    "reference" TEXT,
    "tradeOrderId" TEXT,
    "saleId" TEXT,
    "dueAt" DATETIME,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeLedgerEntry_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeLicence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeAccountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "uploadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedById" TEXT,
    "reviewedAt" DATETIME,
    "reviewedById" TEXT,
    "rejectReason" TEXT,
    "remindedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeLicence_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT,
    "party" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "period" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "storeId" TEXT,
    "memo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "late" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfId" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journalId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "storeId" TEXT,
    "partyId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "memo" TEXT,
    "date" DATETIME NOT NULL,
    "period" TEXT NOT NULL,
    CONSTRAINT "JournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerBalance" (
    "companyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT '',
    "period" TEXT NOT NULL,
    "debitCents" BIGINT NOT NULL DEFAULT 0,
    "creditCents" BIGINT NOT NULL DEFAULT 0,

    PRIMARY KEY ("companyId", "accountId", "storeId", "period")
);

-- CreateTable
CREATE TABLE "LedgerQueue" (
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    PRIMARY KEY ("source", "sourceId")
);

-- CreateTable
CREATE TABLE "StatementPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidOn" DATETIME NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "storeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BankLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "balanceCents" BIGINT,
    "hash" TEXT NOT NULL,
    "uploadId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "journalId" TEXT,
    "matchedById" TEXT,
    "matchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EarlyAccessContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "province" TEXT,
    "source" TEXT,
    "signedUpAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DisplayFeed" (
    "deviceId" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Store_code_key" ON "Store"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE INDEX "Store_regionId_idx" ON "Store"("regionId");

-- CreateIndex
CREATE INDEX "Store_companyId_idx" ON "Store"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_memberId_key" ON "User"("memberId");

-- CreateIndex
CREATE INDEX "User_storeId_idx" ON "User"("storeId");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_customerId_idx" ON "Session"("customerId");

-- CreateIndex
CREATE INDEX "Session_tradeBuyerId_idx" ON "Session"("tradeBuyerId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Device_tokenHash_key" ON "Device"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Device_storeId_prefix_key" ON "Device"("storeId", "prefix");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_sku_key" ON "Variant"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_barcode_key" ON "Variant"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_code_key" ON "Batch"("code");

-- CreateIndex
CREATE INDEX "Batch_variantId_idx" ON "Batch"("variantId");

-- CreateIndex
CREATE INDEX "StockLevel_storeId_variantId_idx" ON "StockLevel"("storeId", "variantId");

-- CreateIndex
CREATE INDEX "StockLevel_variantId_idx" ON "StockLevel"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_storeId_variantId_batchId_key" ON "StockLevel"("storeId", "variantId", "batchId");

-- CreateIndex
CREATE INDEX "StoreVariant_variantId_idx" ON "StoreVariant"("variantId");

-- CreateIndex
CREATE INDEX "StockMovement_storeId_createdAt_idx" ON "StockMovement"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_variantId_idx" ON "StockMovement"("variantId");

-- CreateIndex
CREATE INDEX "StockMovement_batchId_idx" ON "StockMovement"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTake_number_key" ON "StockTake"("number");

-- CreateIndex
CREATE UNIQUE INDEX "StockTakeLine_stockTakeId_variantId_batchId_key" ON "StockTakeLine"("stockTakeId", "variantId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "StockOrder_number_key" ON "StockOrder"("number");

-- CreateIndex
CREATE INDEX "StockOrder_buyerId_status_idx" ON "StockOrder"("buyerId", "status");

-- CreateIndex
CREATE INDEX "StockOrder_sellerId_status_idx" ON "StockOrder"("sellerId", "status");

-- CreateIndex
CREATE INDEX "StockOrderLine_stockOrderId_idx" ON "StockOrderLine"("stockOrderId");

-- CreateIndex
CREATE INDEX "Listing_active_variantId_idx" ON "Listing"("active", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_memberNo_key" ON "Customer"("memberNo");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_idHash_key" ON "Customer"("idHash");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_foundingNo_key" ON "Customer"("foundingNo");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_referralCode_key" ON "Customer"("referralCode");

-- CreateIndex
CREATE INDEX "Customer_homeStoreId_idx" ON "Customer"("homeStoreId");

-- CreateIndex
CREATE INDEX "Customer_lastPurchaseAt_idx" ON "Customer"("lastPurchaseAt");

-- CreateIndex
CREATE INDEX "Customer_tier_idx" ON "Customer"("tier");

-- CreateIndex
CREATE INDEX "Customer_referredById_idx" ON "Customer"("referredById");

-- CreateIndex
CREATE INDEX "Customer_createdAt_idx" ON "Customer"("createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyEntry_customerId_idx" ON "LoyaltyEntry"("customerId");

-- CreateIndex
CREATE INDEX "LoyaltyEntry_storeId_createdAt_idx" ON "LoyaltyEntry"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientAuth_customerId_idx" ON "PatientAuth"("customerId");

-- CreateIndex
CREATE INDEX "ConsentEvent_customerId_idx" ON "ConsentEvent"("customerId");

-- CreateIndex
CREATE INDEX "Suppression_value_idx" ON "Suppression"("value");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_value_source_key" ON "Suppression"("value", "source");

-- CreateIndex
CREATE INDEX "Otp_phone_idx" ON "Otp"("phone");

-- CreateIndex
CREATE INDEX "Otp_email_idx" ON "Otp"("email");

-- CreateIndex
CREATE INDEX "Otp_createdAt_idx" ON "Otp"("createdAt");

-- CreateIndex
CREATE INDEX "Throttle_key_createdAt_idx" ON "Throttle"("key", "createdAt");

-- CreateIndex
CREATE INDEX "Throttle_createdAt_idx" ON "Throttle"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_createdAt_idx" ON "PaymentEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Shift_storeId_closedAt_idx" ON "Shift"("storeId", "closedAt");

-- CreateIndex
CREATE INDEX "Shift_depositId_storeId_idx" ON "Shift"("depositId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_number_key" ON "Sale"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_orderId_key" ON "Sale"("orderId");

-- CreateIndex
CREATE INDEX "Sale_storeId_createdAt_idx" ON "Sale"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");

-- CreateIndex
CREATE INDEX "Sale_tradeAccountId_idx" ON "Sale"("tradeAccountId");

-- CreateIndex
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

-- CreateIndex
CREATE INDEX "Sale_promotionId_idx" ON "Sale"("promotionId");

-- CreateIndex
CREATE INDEX "SaleLine_saleId_idx" ON "SaleLine"("saleId");

-- CreateIndex
CREATE INDEX "SaleLine_variantId_idx" ON "SaleLine"("variantId");

-- CreateIndex
CREATE INDEX "Payment_saleId_idx" ON "Payment"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");

-- CreateIndex
CREATE INDEX "Order_storeId_status_idx" ON "Order"("storeId", "status");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_promotionId_status_idx" ON "Order"("promotionId", "status");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "Expense_storeId_date_idx" ON "Expense"("storeId", "date");

-- CreateIndex
CREATE INDEX "PriceListItem_variantId_idx" ON "PriceListItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_priceListId_variantId_minQty_key" ON "PriceListItem"("priceListId", "variantId", "minQty");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");

-- CreateIndex
CREATE INDEX "MessageLog_campaignId_idx" ON "MessageLog"("campaignId");

-- CreateIndex
CREATE INDEX "MessageLog_customerId_idx" ON "MessageLog"("customerId");

-- CreateIndex
CREATE INDEX "MessageLog_to_idx" ON "MessageLog"("to");

-- CreateIndex
CREATE INDEX "MessageLog_createdAt_idx" ON "MessageLog"("createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_channel_status_createdAt_idx" ON "MessageLog"("channel", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockAlert_customerId_variantId_key" ON "StockAlert"("customerId", "variantId");

-- CreateIndex
CREATE INDEX "Review_hidden_createdAt_idx" ON "Review"("hidden", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_productId_customerId_key" ON "Review"("productId", "customerId");

-- CreateIndex
CREATE INDEX "DailyStoreStat_date_idx" ON "DailyStoreStat"("date");

-- CreateIndex
CREATE INDEX "DailyVariantStat_date_idx" ON "DailyVariantStat"("date");

-- CreateIndex
CREATE INDEX "DailyVariantStat_variantId_date_idx" ON "DailyVariantStat"("variantId", "date");

-- CreateIndex
CREATE INDEX "AuditLog_storeId_at_idx" ON "AuditLog"("storeId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_actorType_actorId_idx" ON "AuditLog"("actorType", "actorId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_customerId_idx" ON "PushSubscription"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Drop_slug_key" ON "Drop"("slug");

-- CreateIndex
CREATE INDEX "Drop_startsAt_idx" ON "Drop"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreEvent_slug_key" ON "StoreEvent"("slug");

-- CreateIndex
CREATE INDEX "StoreEvent_storeId_startsAt_idx" ON "StoreEvent"("storeId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Rsvp_code_key" ON "Rsvp"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Rsvp_eventId_customerId_key" ON "Rsvp"("eventId", "customerId");

-- CreateIndex
CREATE INDEX "MemberOffer_customerId_endsAt_idx" ON "MemberOffer"("customerId", "endsAt");

-- CreateIndex
CREATE INDEX "SocialPost_createdAt_idx" ON "SocialPost"("createdAt");

-- CreateIndex
CREATE INDEX "StudioPlan_createdAt_idx" ON "StudioPlan"("createdAt");

-- CreateIndex
CREATE INDEX "StudioItem_planId_at_idx" ON "StudioItem"("planId", "at");

-- CreateIndex
CREATE INDEX "StudioItem_status_at_idx" ON "StudioItem"("status", "at");

-- CreateIndex
CREATE UNIQUE INDEX "CashDeposit_number_key" ON "CashDeposit"("number");

-- CreateIndex
CREATE UNIQUE INDEX "CashDeposit_slipId_key" ON "CashDeposit"("slipId");

-- CreateIndex
CREATE INDEX "CashDeposit_storeId_bankedOn_idx" ON "CashDeposit"("storeId", "bankedOn");

-- CreateIndex
CREATE INDEX "CashDeposit_status_idx" ON "CashDeposit"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_key_key" ON "Alert"("key");

-- CreateIndex
CREATE INDEX "Alert_storeId_status_createdAt_idx" ON "Alert"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_status_createdAt_idx" ON "Alert"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_userId_idx" ON "Alert"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRun_storeId_month_key" ON "CommissionRun"("storeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "FranchiseLead_number_key" ON "FranchiseLead"("number");

-- CreateIndex
CREATE INDEX "FranchiseLead_status_createdAt_idx" ON "FranchiseLead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FranchiseLead_email_idx" ON "FranchiseLead"("email");

-- CreateIndex
CREATE INDEX "FranchiseLead_ipHash_createdAt_idx" ON "FranchiseLead"("ipHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_customerId_createdAt_idx" ON "SupportTicket"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_storeId_status_idx" ON "SupportTicket"("storeId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedToId_status_idx" ON "SupportTicket"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_email_createdAt_idx" ON "SupportTicket"("email", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_ipHash_createdAt_idx" ON "SupportTicket"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_number_key" ON "ReturnRequest"("number");

-- CreateIndex
CREATE INDEX "ReturnRequest_status_createdAt_idx" ON "ReturnRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReturnRequest_customerId_createdAt_idx" ON "ReturnRequest"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ReturnRequest_storeId_status_idx" ON "ReturnRequest"("storeId", "status");

-- CreateIndex
CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPushSubscription_endpoint_key" ON "StaffPushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "StaffPushSubscription_userId_idx" ON "StaffPushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvoice_uploadId_key" ON "SupplierInvoice"("uploadId");

-- CreateIndex
CREATE INDEX "SupplierInvoice_storeId_status_dueDate_idx" ON "SupplierInvoice"("storeId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "SupplierInvoice_stockOrderId_idx" ON "SupplierInvoice"("stockOrderId");

-- CreateIndex
CREATE INDEX "StoreTask_storeId_doneAt_idx" ON "StoreTask"("storeId", "doneAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreTask_storeId_key_key" ON "StoreTask"("storeId", "key");

-- CreateIndex
CREATE INDEX "ScheduledExport_userId_reportKey_idx" ON "ScheduledExport"("userId", "reportKey");

-- CreateIndex
CREATE INDEX "ScheduledExport_active_cadence_idx" ON "ScheduledExport"("active", "cadence");

-- CreateIndex
CREATE INDEX "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_productId_uploadId_key" ON "ProductImage"("productId", "uploadId");

-- CreateIndex
CREATE INDEX "Address_customerId_isDefault_idx" ON "Address"("customerId", "isDefault");

-- CreateIndex
CREATE INDEX "Wishlist_variantId_idx" ON "Wishlist"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_customerId_variantId_key" ON "Wishlist"("customerId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftVoucher_code_key" ON "GiftVoucher"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GiftVoucher_purchaseOrderId_key" ON "GiftVoucher"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "GiftVoucher_purchasedByCustomerId_createdAt_idx" ON "GiftVoucher"("purchasedByCustomerId", "createdAt");

-- CreateIndex
CREATE INDEX "GiftVoucher_status_expiresAt_idx" ON "GiftVoucher"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "VoucherRedemption_orderId_idx" ON "VoucherRedemption"("orderId");

-- CreateIndex
CREATE INDEX "VoucherRedemption_saleId_idx" ON "VoucherRedemption"("saleId");

-- CreateIndex
CREATE INDEX "VoucherRedemption_voucherId_idx" ON "VoucherRedemption"("voucherId");

-- CreateIndex
CREATE INDEX "ReorderReminder_active_nextAt_idx" ON "ReorderReminder"("active", "nextAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReorderReminder_customerId_variantId_key" ON "ReorderReminder"("customerId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeAccount_number_key" ON "TradeAccount"("number");

-- CreateIndex
CREATE INDEX "TradeAccount_status_idx" ON "TradeAccount"("status");

-- CreateIndex
CREATE INDEX "TradeAccount_name_idx" ON "TradeAccount"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TradeBuyer_email_key" ON "TradeBuyer"("email");

-- CreateIndex
CREATE INDEX "TradeBuyer_tradeAccountId_idx" ON "TradeBuyer"("tradeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOrder_number_key" ON "TradeOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOrder_invoiceNumber_key" ON "TradeOrder"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOrder_saleId_key" ON "TradeOrder"("saleId");

-- CreateIndex
CREATE INDEX "TradeOrder_tradeAccountId_status_idx" ON "TradeOrder"("tradeAccountId", "status");

-- CreateIndex
CREATE INDEX "TradeOrder_storeId_status_idx" ON "TradeOrder"("storeId", "status");

-- CreateIndex
CREATE INDEX "TradeOrder_createdAt_idx" ON "TradeOrder"("createdAt");

-- CreateIndex
CREATE INDEX "TradeOrderLine_tradeOrderId_idx" ON "TradeOrderLine"("tradeOrderId");

-- CreateIndex
CREATE INDEX "TradeOrderLine_variantId_idx" ON "TradeOrderLine"("variantId");

-- CreateIndex
CREATE INDEX "TradeLedgerEntry_tradeAccountId_createdAt_idx" ON "TradeLedgerEntry"("tradeAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeLedgerEntry_saleId_idx" ON "TradeLedgerEntry"("saleId");

-- CreateIndex
CREATE INDEX "TradeLedgerEntry_tradeOrderId_idx" ON "TradeLedgerEntry"("tradeOrderId");

-- CreateIndex
CREATE INDEX "TradeLicence_tradeAccountId_kind_idx" ON "TradeLicence"("tradeAccountId", "kind");

-- CreateIndex
CREATE INDEX "TradeLicence_status_idx" ON "TradeLicence"("status");

-- CreateIndex
CREATE INDEX "TradeLicence_expiresAt_idx" ON "TradeLicence"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_companyId_code_key" ON "LedgerAccount"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_companyId_key_key" ON "LedgerAccount"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_reversalOfId_key" ON "Journal"("reversalOfId");

-- CreateIndex
CREATE INDEX "Journal_companyId_source_sourceId_idx" ON "Journal"("companyId", "source", "sourceId");

-- CreateIndex
CREATE INDEX "Journal_source_sourceId_idx" ON "Journal"("source", "sourceId");

-- CreateIndex
CREATE INDEX "Journal_companyId_period_idx" ON "Journal"("companyId", "period");

-- CreateIndex
CREATE INDEX "Journal_companyId_status_idx" ON "Journal"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_companyId_number_key" ON "Journal"("companyId", "number");

-- CreateIndex
CREATE INDEX "JournalLine_journalId_idx" ON "JournalLine"("journalId");

-- CreateIndex
CREATE INDEX "JournalLine_companyId_accountId_period_idx" ON "JournalLine"("companyId", "accountId", "period");

-- CreateIndex
CREATE INDEX "JournalLine_companyId_accountId_partyId_idx" ON "JournalLine"("companyId", "accountId", "partyId");

-- CreateIndex
CREATE INDEX "JournalLine_companyId_period_idx" ON "JournalLine"("companyId", "period");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "LedgerBalance_companyId_period_idx" ON "LedgerBalance"("companyId", "period");

-- CreateIndex
CREATE INDEX "LedgerQueue_queuedAt_idx" ON "LedgerQueue"("queuedAt");

-- CreateIndex
CREATE INDEX "StatementPayment_storeId_month_idx" ON "StatementPayment"("storeId", "month");

-- CreateIndex
CREATE INDEX "StatementPayment_companyId_idx" ON "StatementPayment"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_accountId_key" ON "BankAccount"("accountId");

-- CreateIndex
CREATE INDEX "BankAccount_companyId_idx" ON "BankAccount"("companyId");

-- CreateIndex
CREATE INDEX "BankLine_companyId_status_idx" ON "BankLine"("companyId", "status");

-- CreateIndex
CREATE INDEX "BankLine_bankAccountId_date_idx" ON "BankLine"("bankAccountId", "date");

-- CreateIndex
CREATE INDEX "BankLine_journalId_idx" ON "BankLine"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "BankLine_bankAccountId_hash_key" ON "BankLine"("bankAccountId", "hash");

-- CreateIndex
CREATE UNIQUE INDEX "EarlyAccessContact_email_key" ON "EarlyAccessContact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EarlyAccessContact_mobile_key" ON "EarlyAccessContact"("mobile");

