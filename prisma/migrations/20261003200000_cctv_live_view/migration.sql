-- CreateEnum
CREATE TYPE "CctvZone" AS ENUM ('GENERAL', 'GATE', 'CLASSROOM');

-- CreateTable
CREATE TABLE "CctvSite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'School CCTV',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "streamBaseUrl" TEXT,
    "nvrHost" TEXT,
    "nvrPort" INTEGER NOT NULL DEFAULT 554,
    "nvrUsername" TEXT,
    "parentAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
    "parentStart" TEXT NOT NULL DEFAULT '08:00',
    "parentEnd" TEXT NOT NULL DEFAULT '14:00',
    "parentDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CctvSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CctvCamera" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" INTEGER NOT NULL,
    "zone" "CctvZone" NOT NULL DEFAULT 'GENERAL',
    "sectionId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CctvCamera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CctvSite_tenantId_key" ON "CctvSite"("tenantId");

-- CreateIndex
CREATE INDEX "CctvCamera_tenantId_zone_idx" ON "CctvCamera"("tenantId", "zone");

-- CreateIndex
CREATE INDEX "CctvCamera_tenantId_sectionId_idx" ON "CctvCamera"("tenantId", "sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CctvCamera_tenantId_channel_key" ON "CctvCamera"("tenantId", "channel");

-- AddForeignKey
ALTER TABLE "CctvCamera" ADD CONSTRAINT "CctvCamera_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "CctvSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctvCamera" ADD CONSTRAINT "CctvCamera_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

