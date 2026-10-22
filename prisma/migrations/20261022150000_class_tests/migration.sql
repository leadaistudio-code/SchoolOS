-- Class tests: a teacher-set test with a per-student completion tick.
-- Additive only; rollback: DROP TABLE "ClassTestResult"; DROP TABLE "ClassTest";

-- CreateTable
CREATE TABLE "ClassTest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classLevelId" TEXT NOT NULL,
    "sectionId" TEXT,
    "classSubjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "syllabus" TEXT,
    "heldOn" DATE NOT NULL,
    "maxMarks" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClassTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassTestResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classTestId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "marks" DOUBLE PRECISION,
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3),

    CONSTRAINT "ClassTestResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassTest_tenantId_classLevelId_heldOn_idx" ON "ClassTest"("tenantId", "classLevelId", "heldOn");

-- CreateIndex
CREATE INDEX "ClassTest_tenantId_teacherId_heldOn_idx" ON "ClassTest"("tenantId", "teacherId", "heldOn");

-- CreateIndex
CREATE INDEX "ClassTestResult_tenantId_studentId_idx" ON "ClassTestResult"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassTestResult_tenantId_classTestId_studentId_key" ON "ClassTestResult"("tenantId", "classTestId", "studentId");

-- AddForeignKey
ALTER TABLE "ClassTest" ADD CONSTRAINT "ClassTest_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTest" ADD CONSTRAINT "ClassTest_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTest" ADD CONSTRAINT "ClassTest_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTest" ADD CONSTRAINT "ClassTest_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTestResult" ADD CONSTRAINT "ClassTestResult_classTestId_fkey" FOREIGN KEY ("classTestId") REFERENCES "ClassTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTestResult" ADD CONSTRAINT "ClassTestResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

