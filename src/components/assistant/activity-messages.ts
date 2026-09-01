/** Warm progress lines while the assistant looks up records. */
const TOOL_ACTIVITY: Record<string, string> = {
  school_overview: "Let me pull up today's figures",
  unmarked_registers: "Checking which registers are still open",
  attendance_report: "Pulling up the attendance report",
  fees_outstanding: 'Looking at outstanding fees',
  fees_collected: 'Checking payments received',
  fees_invoices: 'Going through the invoices',
  find_students: 'Searching student records',
  list_classes: 'Fetching your classes',
  faculty_readiness: 'Checking faculty readiness',
  draft_notice: 'Drafting that notice for you',
}

export function activityForTool(toolName: string): string {
  return TOOL_ACTIVITY[toolName] ?? 'Just a moment'
}

export function activityForLabel(label: string): string {
  const byLabel: Record<string, string> = {
    "Today's figures": TOOL_ACTIVITY.school_overview!,
    'Attendance registers': TOOL_ACTIVITY.unmarked_registers!,
    'Attendance report': TOOL_ACTIVITY.attendance_report!,
    'Outstanding fees': TOOL_ACTIVITY.fees_outstanding!,
    'Payments received': TOOL_ACTIVITY.fees_collected!,
    Invoices: TOOL_ACTIVITY.fees_invoices!,
    'Student records': TOOL_ACTIVITY.find_students!,
    'Classes and sections': TOOL_ACTIVITY.list_classes!,
    'Faculty readiness': TOOL_ACTIVITY.faculty_readiness!,
    'Notice draft': TOOL_ACTIVITY.draft_notice!,
    Records: 'Just a moment',
  }
  return byLabel[label] ?? 'Just a moment'
}
