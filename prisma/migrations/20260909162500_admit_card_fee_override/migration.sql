-- A principal may admit a student with outstanding fees only by recording an
-- explicit exception. The amount remains on the card as the approval snapshot.
ALTER TABLE "AdmitCard"
  ADD COLUMN "feeOverrideReason" TEXT,
  ADD COLUMN "feeOverrideAt" TIMESTAMP(3);

ALTER TABLE "AdmitCard"
  ADD CONSTRAINT "AdmitCard_fee_override_has_reason"
  CHECK (
    "feeOverrideAt" IS NULL
    OR length(trim(COALESCE("feeOverrideReason", ''))) >= 3
  );
