-- CreateTable
CREATE TABLE "CrmReminderRecipient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT,
    "userId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'TEAM',
    "morning" BOOLEAN NOT NULL DEFAULT true,
    "evening" BOOLEAN NOT NULL DEFAULT true,
    "meetings" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmReminderRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmReminderRecipient_isActive_idx" ON "CrmReminderRecipient"("isActive");

-- AddForeignKey
ALTER TABLE "CrmReminderRecipient" ADD CONSTRAINT "CrmReminderRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
