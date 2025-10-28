-- CreateTable
CREATE TABLE "uom_categories" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "baseUoMId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uom_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units_of_measure" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "abbreviation" VARCHAR(20) NOT NULL,
    "conversionFactor" DECIMAL(15,6) NOT NULL,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_uoms" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "uomId" TEXT NOT NULL,
    "conversionFactor" DECIMAL(15,6) NOT NULL,
    "priceMultiplier" DECIMAL(10,6) NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSaleAllowed" BOOLEAN NOT NULL DEFAULT true,
    "isPurchaseAllowed" BOOLEAN NOT NULL DEFAULT true,
    "barcode" VARCHAR(100),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_uoms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uom_categories_name_key" ON "uom_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "uom_categories_baseUoMId_key" ON "uom_categories"("baseUoMId");

-- CreateIndex
CREATE INDEX "uom_categories_name_idx" ON "uom_categories"("name");

-- CreateIndex
CREATE INDEX "units_of_measure_categoryId_idx" ON "units_of_measure"("categoryId");

-- CreateIndex
CREATE INDEX "units_of_measure_name_idx" ON "units_of_measure"("name");

-- CreateIndex
CREATE INDEX "units_of_measure_abbreviation_idx" ON "units_of_measure"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "units_of_measure_categoryId_name_key" ON "units_of_measure"("categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "units_of_measure_categoryId_abbreviation_key" ON "units_of_measure"("categoryId", "abbreviation");

-- CreateIndex
CREATE INDEX "product_uoms_productId_idx" ON "product_uoms"("productId");

-- CreateIndex
CREATE INDEX "product_uoms_uomId_idx" ON "product_uoms"("uomId");

-- CreateIndex
CREATE INDEX "product_uoms_isDefault_idx" ON "product_uoms"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "product_uoms_productId_uomId_key" ON "product_uoms"("productId", "uomId");

-- CreateIndex
CREATE UNIQUE INDEX "product_uoms_barcode_key" ON "product_uoms"("barcode");

-- AddForeignKey
ALTER TABLE "uom_categories" ADD CONSTRAINT "uom_categories_baseUoMId_fkey" FOREIGN KEY ("baseUoMId") REFERENCES "units_of_measure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "uom_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_uoms" ADD CONSTRAINT "product_uoms_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_uoms" ADD CONSTRAINT "product_uoms_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "units_of_measure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
