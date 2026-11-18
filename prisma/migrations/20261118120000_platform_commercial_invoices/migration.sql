-- Platform commercial invoice generator (templates + school-tagged invoices)

CREATE TABLE "PlatformInvoiceTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "body" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformInvoiceTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformInvoiceTemplate_code_key" ON "PlatformInvoiceTemplate"("code");

CREATE TABLE "PlatformInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "issueDate" DATE NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotalMinor" INTEGER NOT NULL,
    "advanceMinor" INTEGER NOT NULL DEFAULT 0,
    "balanceMinor" INTEGER NOT NULL,
    "billToName" TEXT NOT NULL,
    "billToAddress" TEXT,
    "billToEmail" TEXT,
    "billToAttn" TEXT,
    "fromSnapshot" JSONB NOT NULL,
    "notes" TEXT,
    "paymentRef" TEXT,
    "periodStart" DATE,
    "periodEnd" DATE,
    "autoMonthly" BOOLEAN NOT NULL DEFAULT false,
    "sourceInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformInvoice_number_key" ON "PlatformInvoice"("number");
CREATE INDEX "PlatformInvoice_tenantId_status_idx" ON "PlatformInvoice"("tenantId", "status");
CREATE INDEX "PlatformInvoice_tenantId_issueDate_idx" ON "PlatformInvoice"("tenantId", "issueDate");
CREATE INDEX "PlatformInvoice_autoMonthly_status_idx" ON "PlatformInvoice"("autoMonthly", "status");
CREATE INDEX "PlatformInvoice_templateId_idx" ON "PlatformInvoice"("templateId");

CREATE TABLE "PlatformInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "PlatformInvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformInvoiceLine_invoiceId_idx" ON "PlatformInvoiceLine"("invoiceId");

ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PlatformInvoiceTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_sourceInvoiceId_fkey" FOREIGN KEY ("sourceInvoiceId") REFERENCES "PlatformInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformInvoiceLine" ADD CONSTRAINT "PlatformInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PlatformInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
