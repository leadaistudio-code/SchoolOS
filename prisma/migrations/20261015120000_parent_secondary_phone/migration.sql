-- Parent secondary mobile. One nullable column and one index; no existing
-- column, constraint or row is changed.

-- AlterTable
ALTER TABLE "Parent" ADD COLUMN "secondaryPhone" TEXT;

-- CreateIndex
CREATE INDEX "Parent_tenantId_secondaryPhone_idx" ON "Parent"("tenantId", "secondaryPhone");
