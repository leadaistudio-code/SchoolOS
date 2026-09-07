-- MyCampusView Connect / Device Gateway biometric attendance

-- AlterEnum
-- AlterEnum is not needed for AttendanceSource (BIOMETRIC already existed)

-- AlterTable StudentAttendance
ALTER TABLE "StudentAttendance" ADD COLUMN IF NOT EXISTS "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "StudentAttendance" ADD COLUMN IF NOT EXISTS "firstPunchAt" TIMESTAMP(3);
ALTER TABLE "StudentAttendance" ADD COLUMN IF NOT EXISTS "lastPunchAt" TIMESTAMP(3);

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DeviceConnectorStatus" AS ENUM ('PENDING', 'ONLINE', 'OFFLINE', 'REVOKED', 'DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BiometricDeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'SYNCING', 'ERROR', 'DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BiometricDevicePurpose" AS ENUM ('STUDENT', 'STAFF', 'BOTH', 'ACCESS_ONLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BiometricVerificationMethod" AS ENUM ('FINGERPRINT', 'RFID', 'PIN', 'FACE', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BiometricEventDirection" AS ENUM ('IN', 'OUT', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DeviceRawEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'UNMAPPED', 'SKIPPED', 'FAILED', 'CONFLICT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DeviceUserSubjectType" AS ENUM ('STUDENT', 'STAFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DeviceCommandType" AS ENUM ('SYNC_DEVICE', 'TEST_CONNECTION', 'READ_USERS', 'REFRESH_INFO', 'SYNC_DEVICE_TIME');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DeviceCommandStatus" AS ENUM ('PENDING', 'CLAIMED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DeviceConnector" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connectorKey" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "secretPrefix" TEXT NOT NULL,
    "status" "DeviceConnectorStatus" NOT NULL DEFAULT 'PENDING',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT,
    "hostname" TEXT,
    "osInfo" TEXT,
    "pendingEvents" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "pairedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceConnector_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DevicePairingCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeDisplay" TEXT NOT NULL,
    "connectorName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByConnectorId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePairingCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BiometricDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "locationLabel" TEXT,
    "purpose" "BiometricDevicePurpose" NOT NULL DEFAULT 'BOTH',
    "localDeviceId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "machineNumber" TEXT,
    "networkAddress" TEXT,
    "port" INTEGER,
    "connectionSecretEnc" TEXT,
    "configJson" JSONB,
    "status" "BiometricDeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastConnectedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "clockDriftSec" INTEGER,
    "firmware" TEXT,
    "userCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiometricDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeviceUserMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectorId" TEXT,
    "deviceId" TEXT,
    "externalUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "subjectType" "DeviceUserSubjectType" NOT NULL,
    "studentId" TEXT,
    "staffId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastPunchAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceUserMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeviceRawEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "deviceEventId" TEXT,
    "deviceLocalAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationMethod" "BiometricVerificationMethod" NOT NULL DEFAULT 'UNKNOWN',
    "direction" "BiometricEventDirection" NOT NULL DEFAULT 'UNKNOWN',
    "rawPayload" JSONB,
    "status" "DeviceRawEventStatus" NOT NULL DEFAULT 'PENDING',
    "mappingId" TEXT,
    "studentId" TEXT,
    "staffId" TEXT,
    "studentAttendanceId" TEXT,
    "staffAttendanceId" TEXT,
    "processedAt" TIMESTAMP(3),
    "processError" TEXT,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceRawEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeviceCommand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" "DeviceCommandType" NOT NULL,
    "payload" JSONB,
    "status" "DeviceCommandStatus" NOT NULL DEFAULT 'PENDING',
    "resultJson" JSONB,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceConnector_connectorKey_key" ON "DeviceConnector"("connectorKey");
CREATE INDEX IF NOT EXISTS "DeviceConnector_tenantId_status_idx" ON "DeviceConnector"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "DeviceConnector_tenantId_lastSeenAt_idx" ON "DeviceConnector"("tenantId", "lastSeenAt");

CREATE UNIQUE INDEX IF NOT EXISTS "DevicePairingCode_codeHash_key" ON "DevicePairingCode"("codeHash");
CREATE INDEX IF NOT EXISTS "DevicePairingCode_tenantId_expiresAt_idx" ON "DevicePairingCode"("tenantId", "expiresAt");

CREATE INDEX IF NOT EXISTS "BiometricDevice_tenantId_status_idx" ON "BiometricDevice"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "BiometricDevice_tenantId_active_idx" ON "BiometricDevice"("tenantId", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "BiometricDevice_tenantId_connectorId_localDeviceId_key" ON "BiometricDevice"("tenantId", "connectorId", "localDeviceId");

CREATE INDEX IF NOT EXISTS "DeviceUserMapping_tenantId_externalUserId_idx" ON "DeviceUserMapping"("tenantId", "externalUserId");
CREATE INDEX IF NOT EXISTS "DeviceUserMapping_tenantId_studentId_idx" ON "DeviceUserMapping"("tenantId", "studentId");
CREATE INDEX IF NOT EXISTS "DeviceUserMapping_tenantId_staffId_idx" ON "DeviceUserMapping"("tenantId", "staffId");
CREATE INDEX IF NOT EXISTS "DeviceUserMapping_tenantId_active_idx" ON "DeviceUserMapping"("tenantId", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceUserMapping_tenantId_externalUserId_key" ON "DeviceUserMapping"("tenantId", "externalUserId");

CREATE INDEX IF NOT EXISTS "DeviceRawEvent_tenantId_deviceLocalAt_idx" ON "DeviceRawEvent"("tenantId", "deviceLocalAt");
CREATE INDEX IF NOT EXISTS "DeviceRawEvent_tenantId_status_receivedAt_idx" ON "DeviceRawEvent"("tenantId", "status", "receivedAt");
CREATE INDEX IF NOT EXISTS "DeviceRawEvent_tenantId_externalUserId_deviceLocalAt_idx" ON "DeviceRawEvent"("tenantId", "externalUserId", "deviceLocalAt");
CREATE INDEX IF NOT EXISTS "DeviceRawEvent_tenantId_deviceId_deviceLocalAt_idx" ON "DeviceRawEvent"("tenantId", "deviceId", "deviceLocalAt");
CREATE INDEX IF NOT EXISTS "DeviceRawEvent_tenantId_studentId_deviceLocalAt_idx" ON "DeviceRawEvent"("tenantId", "studentId", "deviceLocalAt");
CREATE INDEX IF NOT EXISTS "DeviceRawEvent_tenantId_staffId_deviceLocalAt_idx" ON "DeviceRawEvent"("tenantId", "staffId", "deviceLocalAt");
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceRawEvent_tenantId_dedupeKey_key" ON "DeviceRawEvent"("tenantId", "dedupeKey");

CREATE INDEX IF NOT EXISTS "DeviceCommand_tenantId_connectorId_status_idx" ON "DeviceCommand"("tenantId", "connectorId", "status");
CREATE INDEX IF NOT EXISTS "DeviceCommand_connectorId_status_createdAt_idx" ON "DeviceCommand"("connectorId", "status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "BiometricDevice" ADD CONSTRAINT "BiometricDevice_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "DeviceConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DeviceUserMapping" ADD CONSTRAINT "DeviceUserMapping_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "DeviceConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DeviceUserMapping" ADD CONSTRAINT "DeviceUserMapping_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DeviceRawEvent" ADD CONSTRAINT "DeviceRawEvent_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "DeviceConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DeviceRawEvent" ADD CONSTRAINT "DeviceRawEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "DeviceConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
