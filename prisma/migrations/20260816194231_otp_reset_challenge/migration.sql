-- AlterEnum
ALTER TYPE "TokenPurpose" ADD VALUE 'OTP_RESET';

-- AlterTable
ALTER TABLE "VerificationToken" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "channel" TEXT,
ADD COLUMN     "codeHash" TEXT;
