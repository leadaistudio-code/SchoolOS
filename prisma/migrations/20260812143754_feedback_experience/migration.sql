-- CreateEnum
CREATE TYPE "FeedbackAudience" AS ENUM ('STUDENT', 'PARENT', 'TEACHER');

-- CreateEnum
CREATE TYPE "FeedbackTarget" AS ENUM ('TEACHER', 'SCHOOL', 'STUDENT', 'PTM');

-- CreateEnum
CREATE TYPE "FeedbackQuestionType" AS ENUM ('RATING_5', 'RATING_10', 'YES_NO', 'MULTIPLE_CHOICE', 'CHECKBOX', 'EMOJI', 'NPS', 'SHORT_TEXT', 'LONG_TEXT', 'DROPDOWN');

-- CreateEnum
CREATE TYPE "FeedbackCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FeedbackAssignmentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FeedbackModerationStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'FLAGGED', 'UNDER_REVIEW', 'HIDDEN', 'ESCALATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FeedbackConcernStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'FOLLOW_UP_REQUIRED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FeedbackActionStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FeedbackPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "FeedbackVisibility" AS ENUM ('TEACHER_ONLY', 'STUDENT', 'PARENT', 'STUDENT_AND_PARENT', 'COORDINATOR', 'ADMINISTRATION');

-- CreateTable
CREATE TABLE "FeedbackTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audience" "FeedbackAudience" NOT NULL,
    "target" "FeedbackTarget" NOT NULL,
    "isAnonymousToTarget" BOOLEAN NOT NULL DEFAULT true,
    "minimumResponses" INTEGER NOT NULL DEFAULT 5,
    "classMinNumeric" INTEGER,
    "classMaxNumeric" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedbackTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackQuestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "type" "FeedbackQuestionType" NOT NULL DEFAULT 'RATING_5',
    "category" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "choices" JSONB,
    "isConcern" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sessionId" TEXT,
    "name" TEXT NOT NULL,
    "audience" "FeedbackAudience" NOT NULL,
    "target" "FeedbackTarget" NOT NULL,
    "status" "FeedbackCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "frequency" TEXT NOT NULL DEFAULT 'FORTNIGHTLY',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "classLevelIds" JSONB,
    "sectionIds" JSONB,
    "subjectIds" JSONB,
    "teacherIds" JSONB,
    "studentIds" JSONB,
    "isAnonymousToTarget" BOOLEAN NOT NULL DEFAULT true,
    "minimumResponses" INTEGER NOT NULL DEFAULT 5,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "studentId" TEXT,
    "parentId" TEXT,
    "targetStaffId" TEXT,
    "subjectId" TEXT,
    "classLevelId" TEXT,
    "sectionId" TEXT,
    "periodKey" TEXT NOT NULL,
    "status" "FeedbackAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackResponse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "respondentUserId" TEXT NOT NULL,
    "studentId" TEXT,
    "parentId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackAnswer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "rating" INTEGER,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackConcern" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "status" "FeedbackConcernStatus" NOT NULL DEFAULT 'NEW',
    "ownerId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackConcern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackModeration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "status" "FeedbackModerationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "flagReason" TEXT,
    "note" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackModeration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackActionItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "responseId" TEXT,
    "concernId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "assigneeStaffId" TEXT,
    "priority" "FeedbackPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "FeedbackActionStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "internalNotes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherStudentFeedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT,
    "classLevelId" TEXT,
    "sectionId" TEXT,
    "tags" JSONB,
    "performance" TEXT,
    "participation" TEXT,
    "homework" TEXT,
    "behaviour" TEXT,
    "strengths" TEXT,
    "improvement" TEXT,
    "actions" TEXT,
    "comment" TEXT,
    "visibility" "FeedbackVisibility" NOT NULL DEFAULT 'STUDENT_AND_PARENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherStudentFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackTemplate_tenantId_audience_target_isActive_idx" ON "FeedbackTemplate"("tenantId", "audience", "target", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackTemplate_tenantId_name_key" ON "FeedbackTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "FeedbackQuestion_tenantId_templateId_sortOrder_idx" ON "FeedbackQuestion"("tenantId", "templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "FeedbackCampaign_tenantId_status_startsAt_idx" ON "FeedbackCampaign"("tenantId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "FeedbackCampaign_tenantId_templateId_idx" ON "FeedbackCampaign"("tenantId", "templateId");

-- CreateIndex
CREATE INDEX "FeedbackAssignment_tenantId_studentId_status_idx" ON "FeedbackAssignment"("tenantId", "studentId", "status");

-- CreateIndex
CREATE INDEX "FeedbackAssignment_tenantId_parentId_status_idx" ON "FeedbackAssignment"("tenantId", "parentId", "status");

-- CreateIndex
CREATE INDEX "FeedbackAssignment_tenantId_targetStaffId_status_idx" ON "FeedbackAssignment"("tenantId", "targetStaffId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackAssignment_tenantId_campaignId_studentId_targetStaf_key" ON "FeedbackAssignment"("tenantId", "campaignId", "studentId", "targetStaffId", "subjectId", "periodKey");

-- CreateIndex
CREATE INDEX "FeedbackResponse_tenantId_submittedAt_idx" ON "FeedbackResponse"("tenantId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackResponse_tenantId_assignmentId_key" ON "FeedbackResponse"("tenantId", "assignmentId");

-- CreateIndex
CREATE INDEX "FeedbackAnswer_tenantId_questionId_rating_idx" ON "FeedbackAnswer"("tenantId", "questionId", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackAnswer_tenantId_responseId_questionId_key" ON "FeedbackAnswer"("tenantId", "responseId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackConcern_responseId_key" ON "FeedbackConcern"("responseId");

-- CreateIndex
CREATE INDEX "FeedbackConcern_tenantId_status_createdAt_idx" ON "FeedbackConcern"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackModeration_answerId_key" ON "FeedbackModeration"("answerId");

-- CreateIndex
CREATE INDEX "FeedbackModeration_tenantId_status_createdAt_idx" ON "FeedbackModeration"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackActionItem_tenantId_status_dueAt_idx" ON "FeedbackActionItem"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "FeedbackActionItem_tenantId_assigneeStaffId_status_idx" ON "FeedbackActionItem"("tenantId", "assigneeStaffId", "status");

-- CreateIndex
CREATE INDEX "TeacherStudentFeedback_tenantId_studentId_createdAt_idx" ON "TeacherStudentFeedback"("tenantId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "TeacherStudentFeedback_tenantId_teacherId_createdAt_idx" ON "TeacherStudentFeedback"("tenantId", "teacherId", "createdAt");

-- AddForeignKey
ALTER TABLE "FeedbackQuestion" ADD CONSTRAINT "FeedbackQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FeedbackTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackCampaign" ADD CONSTRAINT "FeedbackCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FeedbackTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackCampaign" ADD CONSTRAINT "FeedbackCampaign_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAssignment" ADD CONSTRAINT "FeedbackAssignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FeedbackCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAssignment" ADD CONSTRAINT "FeedbackAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FeedbackTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAssignment" ADD CONSTRAINT "FeedbackAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAssignment" ADD CONSTRAINT "FeedbackAssignment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAssignment" ADD CONSTRAINT "FeedbackAssignment_targetStaffId_fkey" FOREIGN KEY ("targetStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAssignment" ADD CONSTRAINT "FeedbackAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "FeedbackAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAnswer" ADD CONSTRAINT "FeedbackAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "FeedbackResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAnswer" ADD CONSTRAINT "FeedbackAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "FeedbackQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackConcern" ADD CONSTRAINT "FeedbackConcern_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "FeedbackResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackModeration" ADD CONSTRAINT "FeedbackModeration_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "FeedbackAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackActionItem" ADD CONSTRAINT "FeedbackActionItem_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "FeedbackResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackActionItem" ADD CONSTRAINT "FeedbackActionItem_assigneeStaffId_fkey" FOREIGN KEY ("assigneeStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherStudentFeedback" ADD CONSTRAINT "TeacherStudentFeedback_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherStudentFeedback" ADD CONSTRAINT "TeacherStudentFeedback_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
