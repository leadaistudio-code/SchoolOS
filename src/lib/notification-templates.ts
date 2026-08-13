export const TEMPLATE_EVENTS = [
  { key: 'fee.due', label: 'Fee due reminder' },
  { key: 'attendance.absent', label: 'Student absence' },
  { key: 'result.published', label: 'Result published' },
  { key: 'admission.followup', label: 'Admission follow-up' },
  { key: 'leave.decision', label: 'Leave decision' },
  { key: 'generic.notice', label: 'Generic notice' },
] as const

export const TEMPLATE_CHANNELS = ['EMAIL', 'SMS', 'PUSH', 'IN_APP'] as const

/** Render a template body with simple {{var}} replacement. */
export function renderTemplate(
  body: string,
  vars: Record<string, string | null | undefined>,
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? '')
}
