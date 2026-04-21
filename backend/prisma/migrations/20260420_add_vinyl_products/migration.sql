-- CreateTable
CREATE TABLE "VinylColor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VinylColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VinylProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePerSqInch" DECIMAL(65,30) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productId" TEXT,
    "vinylColorId" TEXT NOT NULL,

    CONSTRAINT "VinylProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VinylColor_name_key" ON "VinylColor"("name");

-- AddForeignKey
ALTER TABLE "VinylProduct" ADD CONSTRAINT "VinylProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinylProduct" ADD CONSTRAINT "VinylProduct_vinylColorId_fkey" FOREIGN KEY ("vinylColorId") REFERENCES "VinylColor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
