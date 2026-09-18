-- Protect posted financial history from hard deletion.
ALTER TABLE "FeeInvoice" DROP CONSTRAINT "FeeInvoice_studentId_fkey";
ALTER TABLE "FeeInvoice" ADD CONSTRAINT "FeeInvoice_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeeInvoiceLine" DROP CONSTRAINT "FeeInvoiceLine_invoiceId_fkey";
ALTER TABLE "FeeInvoiceLine" ADD CONSTRAINT "FeeInvoiceLine_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "FeeInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeePayment" DROP CONSTRAINT "FeePayment_studentId_fkey";
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeePaymentAllocation" DROP CONSTRAINT "FeePaymentAllocation_paymentId_fkey";
ALTER TABLE "FeePaymentAllocation" ADD CONSTRAINT "FeePaymentAllocation_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "FeePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeePaymentAllocation" DROP CONSTRAINT "FeePaymentAllocation_invoiceId_fkey";
ALTER TABLE "FeePaymentAllocation" ADD CONSTRAINT "FeePaymentAllocation_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "FeeInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeeReceipt" DROP CONSTRAINT "FeeReceipt_paymentId_fkey";
ALTER TABLE "FeeReceipt" ADD CONSTRAINT "FeeReceipt_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "FeePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeeRefund" DROP CONSTRAINT "FeeRefund_paymentId_fkey";
ALTER TABLE "FeeRefund" ADD CONSTRAINT "FeeRefund_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "FeePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- NOT VALID preserves legacy imports while enforcing every new/changed row.
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_positive_amount"
  CHECK ("amountMinor" > 0) NOT VALID;
ALTER TABLE "FeePaymentAllocation" ADD CONSTRAINT "FeePaymentAllocation_nonnegative_amount"
  CHECK ("amountMinor" >= 0) NOT VALID;
ALTER TABLE "FeeRefund" ADD CONSTRAINT "FeeRefund_positive_amount"
  CHECK ("amountMinor" > 0) NOT VALID;
ALTER TABLE "StudentFeeCredit" ADD CONSTRAINT "StudentFeeCredit_positive_amount"
  CHECK ("amountMinor" > 0) NOT VALID;
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_positive_amount"
  CHECK ("amountMinor" > 0) NOT VALID;
ALTER TABLE "FeeInvoiceLine" ADD CONSTRAINT "FeeInvoiceLine_valid_amounts"
  CHECK ("amountMinor" >= 0 AND "discountMinor" >= 0 AND "discountMinor" <= "amountMinor") NOT VALID;
ALTER TABLE "FeeInvoice" ADD CONSTRAINT "FeeInvoice_valid_balance"
  CHECK (
    "subtotalMinor" >= 0
    AND "discountMinor" >= 0
    AND "taxMinor" >= 0
    AND "lateFeeMinor" >= 0
    AND "totalMinor" >= 0
    AND "paidMinor" >= 0
    AND "balanceMinor" >= 0
    AND "balanceMinor" = "totalMinor" - "paidMinor"
  ) NOT VALID;
