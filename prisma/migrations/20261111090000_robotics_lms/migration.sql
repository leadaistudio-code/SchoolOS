-- CreateEnum
CREATE TYPE "LmsCourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LmsLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "LmsLessonKind" AS ENUM ('VIDEO', 'TEXT', 'DOCUMENT', 'CODE', 'QUIZ', 'PROJECT');

-- CreateTable
CREATE TABLE "LmsCourse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'ROBOTICS',
    "level" "LmsLevel" NOT NULL DEFAULT 'BEGINNER',
    "gradeFrom" INTEGER,
    "gradeTo" INTEGER,
    "outcomes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "LmsCourseStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LmsCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsModule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LmsModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsLesson" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "courseId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "LmsLessonKind" NOT NULL,
    "position" INTEGER NOT NULL,
    "durationMinutes" INTEGER,
    "videoUrl" TEXT,
    "body" TEXT,
    "documentUrl" TEXT,
    "codeLanguage" TEXT,
    "code" TEXT,
    "quiz" JSONB,
    "passPercent" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LmsLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsCourseAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "classLevelId" TEXT,
    "sectionId" TEXT,
    "assignedById" TEXT,
    "assignedByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LmsCourseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLessonId" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LmsEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsLessonProgress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "bestScorePercent" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LmsLessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsQuizAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "scorePercent" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LmsQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LmsCourse_tenantId_status_idx" ON "LmsCourse"("tenantId", "status");

-- CreateIndex
CREATE INDEX "LmsModule_courseId_position_idx" ON "LmsModule"("courseId", "position");

-- CreateIndex
CREATE INDEX "LmsLesson_courseId_idx" ON "LmsLesson"("courseId");

-- CreateIndex
CREATE INDEX "LmsLesson_moduleId_position_idx" ON "LmsLesson"("moduleId", "position");

-- CreateIndex
CREATE INDEX "LmsCourseAssignment_tenantId_courseId_idx" ON "LmsCourseAssignment"("tenantId", "courseId");

-- CreateIndex
CREATE INDEX "LmsCourseAssignment_tenantId_classLevelId_idx" ON "LmsCourseAssignment"("tenantId", "classLevelId");

-- CreateIndex
CREATE INDEX "LmsEnrollment_tenantId_studentId_idx" ON "LmsEnrollment"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LmsEnrollment_tenantId_courseId_studentId_key" ON "LmsEnrollment"("tenantId", "courseId", "studentId");

-- CreateIndex
CREATE INDEX "LmsLessonProgress_tenantId_lessonId_idx" ON "LmsLessonProgress"("tenantId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LmsLessonProgress_enrollmentId_lessonId_key" ON "LmsLessonProgress"("enrollmentId", "lessonId");

-- CreateIndex
CREATE INDEX "LmsQuizAttempt_tenantId_lessonId_studentId_idx" ON "LmsQuizAttempt"("tenantId", "lessonId", "studentId");

-- AddForeignKey
ALTER TABLE "LmsModule" ADD CONSTRAINT "LmsModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LmsCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsLesson" ADD CONSTRAINT "LmsLesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LmsCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsLesson" ADD CONSTRAINT "LmsLesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LmsModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsCourseAssignment" ADD CONSTRAINT "LmsCourseAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LmsCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsEnrollment" ADD CONSTRAINT "LmsEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LmsCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsEnrollment" ADD CONSTRAINT "LmsEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsLessonProgress" ADD CONSTRAINT "LmsLessonProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "LmsEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsLessonProgress" ADD CONSTRAINT "LmsLessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "LmsLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsQuizAttempt" ADD CONSTRAINT "LmsQuizAttempt_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "LmsEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsQuizAttempt" ADD CONSTRAINT "LmsQuizAttempt_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "LmsLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
