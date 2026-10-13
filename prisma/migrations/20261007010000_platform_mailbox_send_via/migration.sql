-- AlterTable
ALTER TABLE "PlatformMailbox" ADD COLUMN "sendVia" TEXT NOT NULL DEFAULT 'SMTP',
ADD COLUMN "resendKeyEncrypted" TEXT;
