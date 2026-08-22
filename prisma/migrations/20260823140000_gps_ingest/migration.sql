-- AlterTable
ALTER TABLE "Bus" ADD COLUMN     "gpsDeviceId" TEXT;

-- CreateTable
CREATE TABLE "GpsIngestToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GpsIngestToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bus_tenantId_gpsDeviceId_key" ON "Bus"("tenantId", "gpsDeviceId");

-- CreateIndex
CREATE UNIQUE INDEX "GpsIngestToken_tokenHash_key" ON "GpsIngestToken"("tokenHash");

-- CreateIndex
CREATE INDEX "GpsIngestToken_tenantId_revokedAt_idx" ON "GpsIngestToken"("tenantId", "revokedAt");
