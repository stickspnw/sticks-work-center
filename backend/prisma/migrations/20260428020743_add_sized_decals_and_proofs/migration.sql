-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_targetUserId_fkey";

-- DropIndex
DROP INDEX "Product_name_key";

-- AlterTable
ALTER TABLE "OrderLineItem" ADD COLUMN     "heightIn" DECIMAL(65,30),
ADD COLUMN     "sqIn" DECIMAL(65,30),
ADD COLUMN     "widthIn" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "OrderProof" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByInitials" TEXT,

    CONSTRAINT "OrderProof_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OrderProof" ADD CONSTRAINT "OrderProof_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
