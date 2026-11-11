-- CreateEnum
CREATE TYPE "LmsSubmissionStatus" AS ENUM ('SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED');

-- CreateTable
CREATE TABLE "LmsBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "courseId" TEXT,
    "classLevelId" TEXT,
    "sectionId" TEXT,
    "instructorName" TEXT,
    "meetingUrl" TEXT,
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "LmsBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsLiveClass" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agenda" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "meetingUrl" TEXT,
    "recordingUrl" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LmsLiveClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsLiveAttendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "firstJoinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastJoinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joins" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LmsLiveAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsProjectSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "note" TEXT,
    "linkUrl" TEXT,
    "status" "LmsSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER,
    "feedback" TEXT,
    "reviewedById" TEXT,
    "reviewedByLabel" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LmsProjectSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LmsBatch_tenantId_classLevelId_idx" ON "LmsBatch"("tenantId", "classLevelId");

-- CreateIndex
CREATE INDEX "LmsLiveClass_tenantId_startsAt_idx" ON "LmsLiveClass"("tenantId", "startsAt");

-- CreateIndex
CREATE INDEX "LmsLiveClass_batchId_startsAt_idx" ON "LmsLiveClass"("batchId", "startsAt");

-- CreateIndex
CREATE INDEX "LmsLiveAttendance_tenantId_studentId_idx" ON "LmsLiveAttendance"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LmsLiveAttendance_liveClassId_studentId_key" ON "LmsLiveAttendance"("liveClassId", "studentId");

-- CreateIndex
CREATE INDEX "LmsProjectSubmission_tenantId_status_submittedAt_idx" ON "LmsProjectSubmission"("tenantId", "status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LmsProjectSubmission_enrollmentId_lessonId_key" ON "LmsProjectSubmission"("enrollmentId", "lessonId");

-- AddForeignKey
ALTER TABLE "LmsBatch" ADD CONSTRAINT "LmsBatch_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LmsCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsLiveClass" ADD CONSTRAINT "LmsLiveClass_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LmsBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsLiveAttendance" ADD CONSTRAINT "LmsLiveAttendance_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "LmsLiveClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsProjectSubmission" ADD CONSTRAINT "LmsProjectSubmission_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "LmsEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsProjectSubmission" ADD CONSTRAINT "LmsProjectSubmission_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "LmsLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
