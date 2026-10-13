-- CreateEnum
CREATE TYPE "GradingSystem" AS ENUM ('GRADES', 'POINTS', 'DESCRIPTIVE', 'MARKS_ONLY');

-- CreateEnum
CREATE TYPE "GradingBasis" AS ENUM ('PERCENT', 'MARKS');

-- AlterTable
ALTER TABLE "FeeHead" ADD COLUMN     "endsOn" DATE,
ADD COLUMN     "startsOn" DATE;

-- AlterTable
ALTER TABLE "GradingScale" ADD COLUMN     "basis" "GradingBasis" NOT NULL DEFAULT 'PERCENT',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "outOf" DOUBLE PRECISION,
ADD COLUMN     "system" "GradingSystem" NOT NULL DEFAULT 'GRADES';

-- AlterTable
ALTER TABLE "GradeBand" ADD COLUMN     "maxMarks" DOUBLE PRECISION,
ADD COLUMN     "minMarks" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ExamSubject" ADD COLUMN     "internalMaxMarks" DOUBLE PRECISION,
ADD COLUMN     "oralMaxMarks" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Mark" ADD COLUMN     "internalMarks" DOUBLE PRECISION,
ADD COLUMN     "oralMarks" DOUBLE PRECISION;
