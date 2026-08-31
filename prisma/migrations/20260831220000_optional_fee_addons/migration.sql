-- Optional fee lines (e.g. Computer Science ₹500) billed only when a student opts in.
ALTER TABLE "FeeStructureItem" ADD COLUMN "isOptional" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "StudentFeeOption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFeeOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudentFeeOption_tenantId_sessionId_feeHeadId_active_idx" ON "StudentFeeOption"("tenantId", "sessionId", "feeHeadId", "active");

CREATE UNIQUE INDEX "StudentFeeOption_tenantId_studentId_sessionId_feeHeadId_key" ON "StudentFeeOption"("tenantId", "studentId", "sessionId", "feeHeadId");

ALTER TABLE "StudentFeeOption" ADD CONSTRAINT "StudentFeeOption_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentFeeOption" ADD CONSTRAINT "StudentFeeOption_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentFeeOption" ADD CONSTRAINT "StudentFeeOption_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
