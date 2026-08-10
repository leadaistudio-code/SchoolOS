-- AlterTable
ALTER TABLE "ConversationParticipant" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "starredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ConversationParticipant_tenantId_userId_archivedAt_idx" ON "ConversationParticipant"("tenantId", "userId", "archivedAt");
