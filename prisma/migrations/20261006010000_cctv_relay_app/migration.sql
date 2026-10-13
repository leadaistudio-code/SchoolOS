-- AlterTable
ALTER TABLE "CctvSite" ADD COLUMN     "relayAppVersion" TEXT,
ADD COLUMN     "relayKeyCreatedAt" TIMESTAMP(3),
ADD COLUMN     "relayKeyHash" TEXT,
ADD COLUMN     "relayKeyHint" TEXT,
ADD COLUMN     "relayLastSeenAt" TIMESTAMP(3);
