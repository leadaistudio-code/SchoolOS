-- =============================================================================
-- OPTIONAL: Postgres row-level security as defence in depth.
--
-- This file is NOT applied by migrations and the application does not depend
-- on it. Application-level isolation (src/server/db/tenant-client.ts) is the
-- enforced mechanism. Read docs/SECURITY.md before enabling this.
--
-- Prerequisites, both of which you must set up yourself:
--
--   1. The app must connect as a role that is NOT the table owner. A table
--      owner bypasses RLS unless FORCE ROW LEVEL SECURITY is set (this script
--      sets it, but running as a dedicated role is still the safer shape).
--
--   2. Every connection must carry the tenant. The policies below read
--      current_setting('app.tenant_id', true), so the application has to issue
--        SET LOCAL app.tenant_id = '<tenant cuid>';
--      inside the transaction that runs the queries. With a pooled,
--      non-transactional client, a connection can be reused across tenants and
--      the setting will be wrong or absent -- which is exactly why this is not
--      switched on by default.
--
--   3. Set DATABASE_RLS=true so tenantTx() / withTenantRls() run SET LOCAL.
--
-- Enable with:
--   psql "$DATABASE_URL" -f prisma/rls.sql
-- =============================================================================

DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'School','Branding','Setting',
    'Student','Enrollment','Parent','StudentGuardian','Staff','DisciplineRecord',
    'AcademicSession','ClassLevel','Section','Subject','ClassSubject',
    'Curriculum','Chapter','Topic','LearningOutcome',
    'Question','QuestionOption','QuestionTopic',
    'AssessmentType','PaperTemplate','Assessment','AssessmentSection',
    'AssessmentQuestion','QuestionUsage','AssessmentAssignment','AssessmentAttempt',
    'StudentAnswer',
    'StudentAttendance','StaffAttendance','LeaveType','LeaveRequest',
    'FeeHead','FeeStructure','FeeStructureItem','StudentFeeOption','FeeConcession','FeeInvoice',
    'FeeInvoiceLine','FeePayment','FeePaymentAllocation','FeeReceipt',
    'FeeRefund','FeePenaltyRule','SchoolExpense',
    'FeedbackTemplate','FeedbackQuestion','FeedbackCampaign','FeedbackAssignment',
    'FeedbackResponse','FeedbackAnswer','FeedbackConcern','FeedbackModeration',
    'FeedbackActionItem','TeacherStudentFeedback',
    'GradingScale','GradeBand','Exam','ExamClass','ExamSubject','Mark','Result',
    'ReportCardTemplate','CertificateTemplate','Certificate',
    'Homework','HomeworkSubmission','Classwork','TimetablePeriod',
    'TimetableSlot','CalendarEvent',
    'Notice','NoticeTarget','Conversation','ConversationParticipant','Message',
    'Notification','NotificationDelivery',
    'BookCategory','Book','BookCopy','LibraryLoan',
    'AssetCategory','Asset','AssetHistory',
    'Visitor','Appointment','AdmissionLead','LeadFollowUp','LeadActivity',
    'Bus','BusMaintenance','Route','BusStop','TransportAssignment','BusTrip',
    'BusLocation','TransportBoardingLog',
    'Sport','SportsTeam','SportsTeamMember','SchoolEvent','EventParticipant',
    'CmsPage','CmsBlock','CmsPost','CmsMedia',
    'Document','Attachment','ImportBatch','SupportTicket',
    'PushSubscription','TenantDomain'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', target);

    -- USING governs what is visible; WITH CHECK governs what may be written,
    -- so a row cannot be inserted or moved into another tenant either.
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING ("tenantId" = current_setting('app.tenant_id', true))
        WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))
    $f$, target);
  END LOOP;
END
$$;

-- To roll back:
--   Replace the two EXECUTE format lines above with
--     ALTER TABLE %I DISABLE ROW LEVEL SECURITY;
--   or drop the policies individually.
