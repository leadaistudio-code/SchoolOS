-- CreateEnum
CREATE TYPE "BloomLevel" AS ENUM ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE');

-- CreateTable
CREATE TABLE "Curriculum" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "title" TEXT,
    "board" TEXT,
    "description" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Curriculum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "periods" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "weightage" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningOutcome" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "bloomLevel" "BloomLevel",
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LearningOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Curriculum_tenantId_sessionId_isPublished_idx" ON "Curriculum"("tenantId", "sessionId", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "Curriculum_tenantId_sessionId_classSubjectId_key" ON "Curriculum"("tenantId", "sessionId", "classSubjectId");

-- CreateIndex
CREATE INDEX "Chapter_tenantId_curriculumId_position_idx" ON "Chapter"("tenantId", "curriculumId", "position");

-- CreateIndex
CREATE INDEX "Topic_tenantId_chapterId_position_idx" ON "Topic"("tenantId", "chapterId", "position");

-- CreateIndex
CREATE INDEX "LearningOutcome_tenantId_topicId_position_idx" ON "LearningOutcome"("tenantId", "topicId", "position");

-- AddForeignKey
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningOutcome" ADD CONSTRAINT "LearningOutcome_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
