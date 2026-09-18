-- School-provided textbook sources for page-grounded question generation.
CREATE TYPE "TextbookStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

CREATE TABLE "Textbook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "publisher" TEXT,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "TextbookStatus" NOT NULL DEFAULT 'PROCESSING',
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "extractionError" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Textbook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TextbookPage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "textbookId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "TextbookPage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Question"
    ADD COLUMN "textbookId" TEXT,
    ADD COLUMN "sourcePageStart" INTEGER,
    ADD COLUMN "sourcePageEnd" INTEGER;

CREATE UNIQUE INDEX "Textbook_tenantId_classSubjectId_checksum_key"
    ON "Textbook"("tenantId", "classSubjectId", "checksum");
CREATE INDEX "Textbook_tenantId_classSubjectId_status_idx"
    ON "Textbook"("tenantId", "classSubjectId", "status");
CREATE UNIQUE INDEX "TextbookPage_tenantId_textbookId_pageNumber_key"
    ON "TextbookPage"("tenantId", "textbookId", "pageNumber");
CREATE INDEX "TextbookPage_tenantId_textbookId_idx"
    ON "TextbookPage"("tenantId", "textbookId");
CREATE INDEX "Question_tenantId_textbookId_idx"
    ON "Question"("tenantId", "textbookId");

ALTER TABLE "Textbook"
    ADD CONSTRAINT "Textbook_classSubjectId_fkey"
    FOREIGN KEY ("classSubjectId") REFERENCES "ClassSubject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TextbookPage"
    ADD CONSTRAINT "TextbookPage_textbookId_fkey"
    FOREIGN KEY ("textbookId") REFERENCES "Textbook"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Question"
    ADD CONSTRAINT "Question_textbookId_fkey"
    FOREIGN KEY ("textbookId") REFERENCES "Textbook"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Textbook"
    ADD CONSTRAINT "Textbook_pageCount_check" CHECK ("pageCount" >= 0) NOT VALID;
ALTER TABLE "TextbookPage"
    ADD CONSTRAINT "TextbookPage_pageNumber_check" CHECK ("pageNumber" > 0) NOT VALID;
ALTER TABLE "Question"
    ADD CONSTRAINT "Question_source_pages_check"
    CHECK (
      ("sourcePageStart" IS NULL AND "sourcePageEnd" IS NULL)
      OR
      ("sourcePageStart" > 0 AND "sourcePageEnd" >= "sourcePageStart")
    ) NOT VALID;
