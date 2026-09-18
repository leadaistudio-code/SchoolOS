-- School / guest-teacher custom attendance windows on Staff
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "customAttendanceHours" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "attendanceStartMinutes" INTEGER;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "attendanceEndMinutes" INTEGER;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "attendanceLateAfterMinutes" INTEGER;
