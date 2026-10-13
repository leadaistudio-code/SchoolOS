import { formatMoney } from '@/lib/utils'

export type InboundMessage = { from: string; text: string; name?: string }

type Json = Record<string, unknown>
const obj = (v: unknown): Json | undefined => (v && typeof v === 'object' ? (v as Json) : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/**
 * Normalises the three providers' inbound shapes. Returns null for delivery
 * receipts, status callbacks and anything that is not a parent typing text
 * (or tapping a quick-reply button, which arrives as text too).
 */
export function parseInbound(body: unknown): InboundMessage | null {
  const root = obj(body)
  if (!root) return null

  // Twilio: form fields From=whatsapp:+91…, Body, ProfileName
  if (str(root.From) && str(root.Body) !== undefined) {
    return { from: str(root.From)!, text: str(root.Body)!.trim(), name: str(root.ProfileName) }
  }

  // Gupshup v2: { type: 'message', payload: { type: 'text', source, payload: { text }, sender: { name } } }
  if (root.type === 'message') {
    const p = obj(root.payload)
    const inner = obj(p?.payload)
    const text = str(inner?.text) ?? str(inner?.title)
    const from = str(p?.source) ?? str(obj(p?.sender)?.phone)
    if (!from || text === undefined) return null
    return { from, text: text.trim(), name: str(obj(p?.sender)?.name) }
  }

  // Meta Cloud: { entry: [{ changes: [{ value: { contacts, messages: [{ from, type, text: { body } }] } }] }] }
  const first = (v: unknown) => (Array.isArray(v) ? obj(v[0]) : undefined)
  const value = obj(first(first(root.entry)?.changes)?.value)
  const m = first(value?.messages)
  if (m) {
    const text =
      str(obj(m.text)?.body) ?? str(obj(m.button)?.text) ?? str(obj(obj(m.interactive)?.button_reply)?.title) ?? str(obj(obj(m.interactive)?.list_reply)?.title)
    if (!str(m.from) || text === undefined) return null
    const contact = first(value?.contacts)
    return { from: str(m.from)!, text: text.trim(), name: str(obj(contact?.profile)?.name) }
  }

  return null
}

export type Intent =
  | { kind: 'menu' }
  | { kind: 'fees' }
  | { kind: 'receipt' }
  | { kind: 'attendance' }
  | { kind: 'exams' }
  | { kind: 'homework' }
  | { kind: 'office' }
  | { kind: 'switch' }
  | { kind: 'stop' }
  | { kind: 'pick'; index: number }
  | { kind: 'message'; text: string }
  | { kind: 'unknown' }

const KEYWORDS: [RegExp, Intent['kind']][] = [
  [/^(hi|hello|hey|hii+|namaste|menu|start|help)$/i, 'menu'],
  [/\b(fee|fees|dues?|balance|pending)\b/i, 'fees'],
  [/\b(receipt|paid|payment)\b/i, 'receipt'],
  [/\b(attendance|absent|present)\b/i, 'attendance'],
  [/\b(exam|exams|result|results|marks|test)\b/i, 'exams'],
  [/\b(homework|hw|assignment)\b/i, 'homework'],
  [/\b(office|talk|call me|complaint|query|question)\b/i, 'office'],
  [/\b(switch|change child|other child)\b/i, 'switch'],
  [/^(stop|cancel|back)$/i, 'stop'],
]

const NUMBERED: Record<string, Intent['kind']> = {
  '1': 'fees',
  '2': 'receipt',
  '3': 'attendance',
  '4': 'exams',
  '5': 'homework',
  '6': 'office',
  '0': 'switch',
}

/** What the parent meant, given what the bot last asked for. */
export function interpret(text: string, awaiting: string | null): Intent {
  const t = text.trim()
  if (awaiting === 'QUERY') {
    if (/^(stop|cancel|back|menu)$/i.test(t)) return { kind: 'stop' }
    return t ? { kind: 'message', text: t.slice(0, 1000) } : { kind: 'unknown' }
  }
  if ((awaiting === 'CHILD' || awaiting === 'SCHOOL') && /^\d{1,2}$/.test(t)) {
    return { kind: 'pick', index: Number(t) - 1 }
  }
  if (NUMBERED[t]) return { kind: NUMBERED[t] } as Intent
  for (const [re, kind] of KEYWORDS) if (re.test(t)) return { kind } as Intent
  return { kind: 'unknown' }
}

export function menuText(schoolName: string, childName: string, multipleChildren: boolean) {
  return [
    `*${schoolName}* — ${childName}`,
    '',
    'Reply with a number:',
    '1️⃣ Fees due',
    '2️⃣ Last receipt',
    '3️⃣ Attendance this month',
    '4️⃣ Exams & results',
    '5️⃣ Homework',
    '6️⃣ Message the school office',
    ...(multipleChildren ? ['0️⃣ Switch child'] : []),
  ].join('\n')
}

export function pickListText(title: string, items: string[]) {
  return [title, '', ...items.map((it, i) => `${i + 1}. ${it}`), '', 'Reply with the number.'].join('\n')
}

export type FeesData = {
  invoices: { title: string; dueOn: string; balanceMinor: number; overdue: boolean }[]
  payLink: string | null
}

export function feesText(child: string, d: FeesData) {
  if (d.invoices.length === 0) return `✅ ${child} has no fees due right now.`
  const total = d.invoices.reduce((s, i) => s + i.balanceMinor, 0)
  const overdue = d.invoices.filter((i) => i.overdue).reduce((s, i) => s + i.balanceMinor, 0)
  const lines = d.invoices.slice(0, 6).map((i) => `• ${i.title}: ${formatMoney(i.balanceMinor)} (due ${i.dueOn})${i.overdue ? ' ⚠️' : ''}`)
  if (d.invoices.length > 6) lines.push(`…and ${d.invoices.length - 6} more`)
  return [
    `💰 *Fees due for ${child}: ${formatMoney(total)}*`,
    ...(overdue > 0 ? [`Overdue: ${formatMoney(overdue)}`] : []),
    '',
    ...lines,
    ...(d.payLink ? ['', `Pay online: ${d.payLink}`] : []),
  ].join('\n')
}

export type ReceiptData = { number: string; amountMinor: number; paidOn: string; mode: string; link: string | null } | null

export function receiptText(child: string, r: ReceiptData) {
  if (!r) return `No fee payments recorded for ${child} yet.`
  return [
    `🧾 *Last receipt for ${child}*`,
    `Receipt ${r.number}`,
    `${formatMoney(r.amountMinor)} paid on ${r.paidOn} (${r.mode.replaceAll('_', ' ').toLowerCase()})`,
    ...(r.link ? ['', r.link] : []),
  ].join('\n')
}

export type AttendanceData = { monthLabel: string; present: number; absent: number; late: number; leave: number; absentDates: string[]; today: string | null }

export function attendanceText(child: string, d: AttendanceData) {
  const marked = d.present + d.absent + d.late + d.leave
  if (marked === 0) return `No attendance marked for ${child} in ${d.monthLabel} yet.`
  const pct = Math.round(((d.present + d.late) / marked) * 100)
  return [
    `📅 *${child} — ${d.monthLabel}*`,
    `Present ${d.present + d.late} of ${marked} days (${pct}%)`,
    ...(d.late ? [`Late: ${d.late}`] : []),
    ...(d.leave ? [`On leave: ${d.leave}`] : []),
    ...(d.absentDates.length ? [`Absent: ${d.absentDates.join(', ')}`] : []),
    ...(d.today ? ['', `Today: ${d.today}`] : []),
  ].join('\n')
}

export type ExamsData = {
  upcoming: { date: string; subject: string; exam: string; time: string | null }[]
  latest: { exam: string; percentage: number; grade: string | null; rank: number | null } | null
}

export function examsText(child: string, d: ExamsData) {
  if (!d.upcoming.length && !d.latest) return `No upcoming exams or published results for ${child}.`
  const out: string[] = []
  if (d.upcoming.length) {
    out.push(`📝 *Upcoming papers for ${child}*`)
    for (const u of d.upcoming.slice(0, 8)) out.push(`• ${u.date}: ${u.subject}${u.time ? ` at ${u.time}` : ''} (${u.exam})`)
  }
  if (d.latest) {
    if (out.length) out.push('')
    out.push(
      `🏆 *Latest result — ${d.latest.exam}*`,
      `${Math.round(d.latest.percentage * 10) / 10}%${d.latest.grade ? ` · Grade ${d.latest.grade}` : ''}${d.latest.rank ? ` · Rank ${d.latest.rank}` : ''}`,
    )
  }
  return out.join('\n')
}

export type HomeworkData = { items: { subject: string; title: string; dueOn: string }[] }

export function homeworkText(child: string, d: HomeworkData) {
  if (!d.items.length) return `📚 No homework due for ${child} in the next few days.`
  return [`📚 *Homework for ${child}*`, ...d.items.slice(0, 10).map((h) => `• ${h.subject}: ${h.title} (due ${h.dueOn})`)].join('\n')
}

export const OFFICE_PROMPT =
  '✍️ Type your message for the school office in one message. They will reply here.\nSend *cancel* to go back.'

export const NOT_REGISTERED =
  'Sorry, this number is not registered with any school on MyCampusView. Please ask the school office to add it to your child’s profile.'
