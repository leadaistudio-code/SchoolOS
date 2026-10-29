-- AlterTable
ALTER TABLE "CrmReminderRecipient" ADD COLUMN "weekly" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CrmReminderRecipient" ADD COLUMN "lastListIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CrmReminderRecipient" ADD COLUMN "lastListAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CrmStageCadence" (
    "stage" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "followUpType" TEXT NOT NULL DEFAULT 'CALL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmStageCadence_pkey" PRIMARY KEY ("stage")
);
