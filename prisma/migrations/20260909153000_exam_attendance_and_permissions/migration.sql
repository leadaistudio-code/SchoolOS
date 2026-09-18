CREATE TYPE "ExamAttendanceSource" AS ENUM ('BARCODE', 'MANUAL');

CREATE TABLE "ExamAttendance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "examSubjectId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
  "source" "ExamAttendanceSource" NOT NULL DEFAULT 'MANUAL',
  "checkedInAt" TIMESTAMP(3),
  "markedById" TEXT,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExamAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExamAttendance_tenantId_examSubjectId_studentId_key"
  ON "ExamAttendance"("tenantId", "examSubjectId", "studentId");
CREATE INDEX "ExamAttendance_tenantId_examSubjectId_status_idx"
  ON "ExamAttendance"("tenantId", "examSubjectId", "status");
CREATE INDEX "ExamAttendance_tenantId_studentId_idx"
  ON "ExamAttendance"("tenantId", "studentId");

ALTER TABLE "ExamAttendance"
  ADD CONSTRAINT "ExamAttendance_examSubjectId_fkey"
  FOREIGN KEY ("examSubjectId") REFERENCES "ExamSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ExamAttendance_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ExamAttendance_markedById_fkey"
  FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "module", "action", "label")
VALUES
  ('perm_students_id_cards_20260909', 'students.id_cards', 'students', 'id_cards', 'Create and print student ID cards'),
  ('perm_exams_attendance_20260909', 'exams.attendance', 'exams', 'attendance', 'Scan and manage exam attendance')
ON CONFLICT ("key") DO UPDATE
SET "module" = EXCLUDED."module",
    "action" = EXCLUDED."action",
    "label" = EXCLUDED."label";

-- School administrators receive all tenant permissions, principals receive
-- both operational permissions, and teachers can run the exam entry desk.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."key" IN ('students.id_cards', 'exams.attendance')
WHERE role."tenantId" IS NULL
  AND (
    role."key" IN ('SCHOOL_ADMIN', 'PRINCIPAL')
    OR (role."key" = 'TEACHER' AND permission."key" = 'exams.attendance')
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
