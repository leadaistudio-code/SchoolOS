-- Section ↔ class-subject mapping for electives / stream splits.
-- Admit cards and similar views can filter papers to the student's section.

CREATE TABLE "SectionSubject" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,

    CONSTRAINT "SectionSubject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SectionSubject_tenantId_sectionId_classSubjectId_key" ON "SectionSubject"("tenantId", "sectionId", "classSubjectId");

CREATE INDEX "SectionSubject_tenantId_classSubjectId_idx" ON "SectionSubject"("tenantId", "classSubjectId");

CREATE INDEX "SectionSubject_tenantId_sectionId_idx" ON "SectionSubject"("tenantId", "sectionId");

ALTER TABLE "SectionSubject" ADD CONSTRAINT "SectionSubject_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SectionSubject" ADD CONSTRAINT "SectionSubject_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
