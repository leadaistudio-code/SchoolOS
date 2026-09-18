CREATE TABLE "CloudBiometricEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ingestTokenHash" TEXT NOT NULL,
    "ingestTokenPrefix" TEXT NOT NULL,
    "pushDeviceIdHash" TEXT NOT NULL,
    "pushDeviceIdSuffix" TEXT NOT NULL,
    "allowedSourceIp" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "lastSourceIp" TEXT,
    "lastError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudBiometricEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CloudBiometricEndpoint_deviceId_key"
    ON "CloudBiometricEndpoint"("deviceId");
CREATE UNIQUE INDEX "CloudBiometricEndpoint_ingestTokenHash_key"
    ON "CloudBiometricEndpoint"("ingestTokenHash");
CREATE UNIQUE INDEX "CloudBiometricEndpoint_pushDeviceIdHash_key"
    ON "CloudBiometricEndpoint"("pushDeviceIdHash");
CREATE INDEX "CloudBiometricEndpoint_tenantId_active_idx"
    ON "CloudBiometricEndpoint"("tenantId", "active");
CREATE INDEX "CloudBiometricEndpoint_tenantId_lastSeenAt_idx"
    ON "CloudBiometricEndpoint"("tenantId", "lastSeenAt");

ALTER TABLE "CloudBiometricEndpoint"
    ADD CONSTRAINT "CloudBiometricEndpoint_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
