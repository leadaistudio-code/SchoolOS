-- Allow the same teacher in multiple sections during one period (parallel streams).
DROP INDEX IF EXISTS "TimetableSlot_tenantId_teacherId_dayOfWeek_periodId_key";
