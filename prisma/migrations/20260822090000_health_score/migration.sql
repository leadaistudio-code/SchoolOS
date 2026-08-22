-- CreateEnum
CREATE TYPE "ScoreSubject" AS ENUM ('STUDENT', 'SECTION', 'CLASS', 'SCHOOL', 'STAFF');

-- CreateTable
CREATE TABLE "ScoreWeight" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "population" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT,
    "subjectType" "ScoreSubject" NOT NULL,
    "subjectId" TEXT NOT NULL DEFAULT '',
    "subjectName" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "band" TEXT NOT NULL,
    "coverage" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "breakdown" JSONB NOT NULL,
    "capturedOn" DATE NOT NULL,
    "capturedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoreWeight_tenantId_population_idx" ON "ScoreWeight"("tenantId", "population");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreWeight_tenantId_population_metric_key" ON "ScoreWeight"("tenantId", "population", "metric");

-- CreateIndex
CREATE INDEX "ScoreSnapshot_tenantId_subjectType_capturedOn_idx" ON "ScoreSnapshot"("tenantId", "subjectType", "capturedOn");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreSnapshot_tenantId_subjectType_subjectId_capturedOn_key" ON "ScoreSnapshot"("tenantId", "subjectType", "subjectId", "capturedOn");
