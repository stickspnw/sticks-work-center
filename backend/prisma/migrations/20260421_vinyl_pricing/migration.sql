-- CreateTable
CREATE TABLE "PrintedDecalPricing" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Printed Decal Price',
    "pricePerSqInch" DECIMAL(65,30) NOT NULL DEFAULT 0.60,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintedDecalPricing_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "VinylColor" ADD COLUMN "productId" TEXT;
ALTER TABLE "VinylColor" ADD CONSTRAINT "VinylColor_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
