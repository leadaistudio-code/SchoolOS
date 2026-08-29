-- Admit cards for examinations with principal approval workflow.
CREATE TYPE "AdmitCardStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AdmitCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "AdmitCardStatus" NOT NULL DEFAULT 'PENDING',
    "feeDueMinor" INTEGER NOT NULL DEFAULT 0,
    "issuedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "verifyToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmitCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdmitCard_verifyToken_key" ON "AdmitCard"("verifyToken");
CREATE UNIQUE INDEX "AdmitCard_tenantId_examId_studentId_key" ON "AdmitCard"("tenantId", "examId", "studentId");
CREATE UNIQUE INDEX "AdmitCard_tenantId_number_key" ON "AdmitCard"("tenantId", "number");
CREATE INDEX "AdmitCard_tenantId_examId_status_idx" ON "AdmitCard"("tenantId", "examId", "status");

ALTER TABLE "AdmitCard" ADD CONSTRAINT "AdmitCard_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdmitCard" ADD CONSTRAINT "AdmitCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
