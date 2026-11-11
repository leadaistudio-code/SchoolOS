-- CreateEnum
CREATE TYPE "LmsKitCondition" AS ENUM ('GOOD', 'DAMAGED', 'PARTS_MISSING', 'LOST');

-- CreateTable
CREATE TABLE "LmsCertificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "courseCategory" TEXT NOT NULL,
    "courseLevel" "LmsLevel" NOT NULL,
    "lessons" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "scorePercent" INTEGER,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "revokedByLabel" TEXT,

    CONSTRAINT "LmsCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsKit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "courseId" TEXT,
    "quantity" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "LmsKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsKitLoan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueOn" DATE,
    "note" TEXT,
    "issuedById" TEXT,
    "issuedByLabel" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnCondition" "LmsKitCondition",
    "returnNote" TEXT,
    "returnedByLabel" TEXT,

    CONSTRAINT "LmsKitLoan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LmsCertificate_enrollmentId_key" ON "LmsCertificate"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "LmsCertificate_verifyToken_key" ON "LmsCertificate"("verifyToken");

-- CreateIndex
CREATE INDEX "LmsCertificate_tenantId_studentId_idx" ON "LmsCertificate"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "LmsCertificate_tenantId_issuedAt_idx" ON "LmsCertificate"("tenantId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LmsCertificate_tenantId_number_key" ON "LmsCertificate"("tenantId", "number");

-- CreateIndex
CREATE INDEX "LmsKit_tenantId_name_idx" ON "LmsKit"("tenantId", "name");

-- CreateIndex
CREATE INDEX "LmsKitLoan_tenantId_studentId_idx" ON "LmsKitLoan"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "LmsKitLoan_tenantId_returnedAt_dueOn_idx" ON "LmsKitLoan"("tenantId", "returnedAt", "dueOn");

-- CreateIndex
CREATE INDEX "LmsKitLoan_kitId_returnedAt_idx" ON "LmsKitLoan"("kitId", "returnedAt");

-- AddForeignKey
ALTER TABLE "LmsCertificate" ADD CONSTRAINT "LmsCertificate_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "LmsEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsKit" ADD CONSTRAINT "LmsKit_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LmsCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsKitLoan" ADD CONSTRAINT "LmsKitLoan_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "LmsKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
