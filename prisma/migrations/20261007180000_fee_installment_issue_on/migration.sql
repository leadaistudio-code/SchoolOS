-- Invoice generation date per installment (null = 1st of the due month).
ALTER TABLE "FeeInstallment" ADD COLUMN "issueOn" DATE;
