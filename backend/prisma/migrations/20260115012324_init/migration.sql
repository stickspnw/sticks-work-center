-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STANDARD', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('WIP', 'FINISHED', 'DELETED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('GOOGLE_LINK');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "shippingAddress" TEXT NOT NULL,
    "dateAdded" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSequence" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "current" INTEGER NOT NULL,

    CONSTRAINT "OrderSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'WIP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "customerId" TEXT NOT NULL,
    "customerNameSnapshot" TEXT NOT NULL,
    "customerPhoneSnapshot" TEXT,
    "customerEmailSnapshot" TEXT,
    "customerShippingAddressSnapshot" TEXT NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "catalogUnitPriceSnapshot" DECIMAL(65,30) NOT NULL,
    "unitPriceFinal" DECIMAL(65,30) NOT NULL,
    "isPriceOverridden" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "lineTotal" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "attachmentType" "AttachmentType" NOT NULL DEFAULT 'GOOGLE_LINK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByInitials" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttachmentVersion" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "googleUrl" TEXT NOT NULL,
    "note" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByInitials" TEXT NOT NULL,

    CONSTRAINT "AttachmentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initials" TEXT,
    "actorUserId" TEXT,
    "summary" TEXT NOT NULL,
    "detailsJson" JSONB NOT NULL,

    CONSTRAINT "OrderHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_orderId_label_key" ON "Attachment"("orderId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "AttachmentVersion_attachmentId_versionNumber_key" ON "AttachmentVersion"("attachmentId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AttachmentVersion_attachmentId_googleUrl_key" ON "AttachmentVersion"("attachmentId", "googleUrl");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentVersion" ADD CONSTRAINT "AttachmentVersion_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderHistory" ADD CONSTRAINT "OrderHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderHistory" ADD CONSTRAINT "OrderHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
