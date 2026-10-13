-- CreateTable
CREATE TABLE "CrmPhoto" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "visitId" TEXT,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CrmPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmPhoto_storageKey_key" ON "CrmPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "CrmPhoto_schoolId_createdAt_idx" ON "CrmPhoto"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmPhoto_visitId_idx" ON "CrmPhoto"("visitId");

-- AddForeignKey
ALTER TABLE "CrmPhoto" ADD CONSTRAINT "CrmPhoto_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "CrmSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPhoto" ADD CONSTRAINT "CrmPhoto_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "CrmVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
