-- Preserve half-days accurately instead of rounding them to whole paid days.
ALTER TABLE "StaffPayslip"
  ALTER COLUMN "paidDays" TYPE DOUBLE PRECISION
  USING "paidDays"::DOUBLE PRECISION;

-- Freeze the attendance facts and manual decision that produced each payslip.
ALTER TABLE "StaffPayslip"
  ADD COLUMN "lateCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "absentCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "halfDayCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "latePenaltyDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "manualDeductionMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "manualDeductionReason" TEXT;

ALTER TABLE "StaffPayslip"
  ADD CONSTRAINT "StaffPayslip_attendance_counts_non_negative"
    CHECK (
      "workingDays" >= 0
      AND "paidDays" >= 0
      AND "lateCount" >= 0
      AND "absentCount" >= 0
      AND "halfDayCount" >= 0
      AND "latePenaltyDays" >= 0
    ),
  ADD CONSTRAINT "StaffPayslip_manual_deduction_non_negative"
    CHECK ("manualDeductionMinor" >= 0),
  ADD CONSTRAINT "StaffPayslip_manual_deduction_has_reason"
    CHECK (
      "manualDeductionMinor" = 0
      OR length(trim(COALESCE("manualDeductionReason", ''))) >= 3
    );
