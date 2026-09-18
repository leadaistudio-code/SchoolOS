ALTER TABLE "StudentFeeAssignment"
  ADD COLUMN "autoFeeHeadIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
