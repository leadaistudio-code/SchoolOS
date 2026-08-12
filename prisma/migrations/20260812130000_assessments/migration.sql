-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ASSIGNED', 'CLOSED');

-- CreateTable
CREATE TABLE "AssessmentType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marks" DOUBLE PRECISION,
    "minutes" INTEGER,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headingOverride" TEXT,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showStudentName" BOOLEAN NOT NULL DEFAULT true,
    "showRollNumber" BOOLEAN NOT NULL DEFAULT true,
    "showDate" BOOLEAN NOT NULL DEFAULT true,
    "generalInstructions" TEXT,
    "footerNote" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PaperTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "sectionId" TEXT,
    "assessmentTypeId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "totalMarks" DOUBLE PRECISION NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "instructions" TEXT,
    "answerKeyNotes" TEXT,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "parentId" TEXT,
    "setLabel" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssessmentSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "questionId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "marks" DOUBLE PRECISION NOT NULL,
    "textSnapshot" TEXT NOT NULL,
    "optionsSnapshot" JSONB,
    "answerSnapshot" TEXT,
    "typeSnapshot" "QuestionType" NOT NULL,
    "difficultySnapshot" "QuestionDifficulty" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "usedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentType_tenantId_isActive_position_idx" ON "AssessmentType"("tenantId", "isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentType_tenantId_key_key" ON "AssessmentType"("tenantId", "key");

-- CreateIndex
CREATE INDEX "PaperTemplate_tenantId_isDefault_idx" ON "PaperTemplate"("tenantId", "isDefault");

-- CreateIndex
CREATE INDEX "Assessment_tenantId_classSubjectId_status_idx" ON "Assessment"("tenantId", "classSubjectId", "status");

-- CreateIndex
CREATE INDEX "Assessment_tenantId_sessionId_createdAt_idx" ON "Assessment"("tenantId", "sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "Assessment_tenantId_createdById_idx" ON "Assessment"("tenantId", "createdById");

-- CreateIndex
CREATE INDEX "AssessmentSection_tenantId_assessmentId_position_idx" ON "AssessmentSection"("tenantId", "assessmentId", "position");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_tenantId_assessmentId_position_idx" ON "AssessmentQuestion"("tenantId", "assessmentId", "position");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_tenantId_sectionId_position_idx" ON "AssessmentQuestion"("tenantId", "sectionId", "position");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_tenantId_questionId_idx" ON "AssessmentQuestion"("tenantId", "questionId");

-- CreateIndex
CREATE INDEX "QuestionUsage_tenantId_questionId_usedOn_idx" ON "QuestionUsage"("tenantId", "questionId", "usedOn");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionUsage_tenantId_questionId_assessmentId_key" ON "QuestionUsage"("tenantId", "questionId", "assessmentId");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_assessmentTypeId_fkey" FOREIGN KEY ("assessmentTypeId") REFERENCES "AssessmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PaperTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSection" ADD CONSTRAINT "AssessmentSection_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "AssessmentSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionUsage" ADD CONSTRAINT "QuestionUsage_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionUsage" ADD CONSTRAINT "QuestionUsage_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

