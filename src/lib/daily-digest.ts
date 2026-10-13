/**
 * The principal's daily WhatsApp summaries. Formatting is kept pure so the
 * exact wording can be tested and previewed before anything is sent.
 */
import { formatMoney } from '@/lib/utils'
import { minutesOf } from '@/lib/ist-clock'

export type DigestSlot = 'morning' | 'evening'

export type DigestConfig = {
  morningEnabled: boolean
  morningTime: string
  eveningEnabled: boolean
  eveningTime: string
  skipSundays: boolean
  recipientUserIds: string[]
  extraPhones: { name: string; phone: string }[]
  lastSent: Partial<Record<DigestSlot, string>>
}

export const DEFAULT_DIGEST: DigestConfig = {
  morningEnabled: true,
  morningTime: '09:30',
  eveningEnabled: true,
  eveningTime: '18:00',
  skipSundays: true,
  recipientUserIds: [],
  extraPhones: [],
  lastSent: {},
}

export function parseDigestConfig(raw: unknown): DigestConfig {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<DigestConfig>
  const time = (t: unknown, fallback: string) => (typeof t === 'string' && minutesOf(t) != null ? t : fallback)
  return {
    morningEnabled: v.morningEnabled ?? DEFAULT_DIGEST.morningEnabled,
    morningTime: time(v.morningTime, DEFAULT_DIGEST.morningTime),
    eveningEnabled: v.eveningEnabled ?? DEFAULT_DIGEST.eveningEnabled,
    eveningTime: time(v.eveningTime, DEFAULT_DIGEST.eveningTime),
    skipSundays: v.skipSundays ?? DEFAULT_DIGEST.skipSundays,
    recipientUserIds: Array.isArray(v.recipientUserIds) ? v.recipientUserIds.filter((x) => typeof x === 'string') : [],
    extraPhones: Array.isArray(v.extraPhones)
      ? v.extraPhones.filter((p) => p && typeof p.phone === 'string' && p.phone.replace(/\D/g, '').length >= 10)
      : [],
    lastSent: v.lastSent && typeof v.lastSent === 'object' ? v.lastSent : {},
  }
}

/** Sends are allowed up to three hours late, so a scheduler outage cannot spam a stale morning summary at night. */
const LATE_WINDOW_MIN = 180

export function slotDue(
  config: DigestConfig,
  slot: DigestSlot,
  clock: { iso: string; minutes: number; weekday: number },
): boolean {
  const enabled = slot === 'morning' ? config.morningEnabled : config.eveningEnabled
  if (!enabled) return false
  if (config.skipSundays && clock.weekday === 7) return false
  if (config.lastSent[slot] === clock.iso) return false
  const at = minutesOf(slot === 'morning' ? config.morningTime : config.eveningTime)
  if (at == null) return false
  return clock.minutes >= at && clock.minutes - at <= LATE_WINDOW_MIN
}

export type MorningData = {
  school: string
  dayLabel: string
  holiday: string | null
  students: { enrolled: number; present: number; absent: number; marked: number; unmarkedSections: string[] }
  staff: { active: number; present: number; onLeave: number; absent: number; notIn: number }
  cover: { teachersAway: number; lessons: number; arranged: number; open: number }
  pending: { leave: number; refunds: number; parentQueries: number }
  events: string[]
}

export type EveningData = {
  school: string
  dayLabel: string
  currency: string
  collected: { totalMinor: number; receipts: number; byMode: { mode: string; amountMinor: number }[] }
  dues: { outstandingMinor: number; overdueMinor: number }
  expensesMinor: number
  attendance: { studentPercent: number | null; staffPresent: number; staffActive: number }
  gate: { earlyExits: number; visitors: number }
  pending: { leave: number; refunds: number; parentQueries: number }
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : '—')
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const MODE_LABEL: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CHEQUE: 'Cheque',
  BANK_TRANSFER: 'Bank',
  CARD: 'Card',
  NET_BANKING: 'Net banking',
  ONLINE: 'Online',
  WALLET: 'Wallet',
}

function pendingLine(p: { leave: number; refunds: number; parentQueries: number }): string | null {
  const parts = [
    p.leave ? plural(p.leave, 'leave request') : null,
    p.refunds ? plural(p.refunds, 'refund') : null,
    p.parentQueries ? plural(p.parentQueries, 'parent query', 'parent queries') : null,
  ].filter(Boolean)
  return parts.length ? `⏳ Waiting on you: ${parts.join(' · ')}` : null
}

export function formatMorningDigest(d: MorningData, link: string): { title: string; body: string } {
  const lines: string[] = []
  if (d.holiday) lines.push(`🎉 Holiday today: ${d.holiday}`)
  const s = d.students
  if (s.enrolled > 0) {
    lines.push(
      s.marked > 0
        ? `👩‍🎓 Students: ${s.present}/${s.marked} present (${pct(s.present, s.marked)}) · ${plural(s.absent, 'absent', 'absent')}`
        : `👩‍🎓 Students: attendance not marked yet (${s.enrolled} enrolled)`,
    )
    if (s.unmarkedSections.length > 0) {
      const shown = s.unmarkedSections.slice(0, 6).join(', ')
      const more = s.unmarkedSections.length > 6 ? ` +${s.unmarkedSections.length - 6} more` : ''
      lines.push(`📝 Not marked: ${shown}${more}`)
    }
  }
  const t = d.staff
  if (t.active > 0) {
    const extra = [
      t.onLeave ? `${t.onLeave} on leave` : null,
      t.absent ? `${t.absent} absent` : null,
      t.notIn ? `${t.notIn} not checked in` : null,
    ].filter(Boolean)
    lines.push(`👩‍🏫 Staff: ${t.present}/${t.active} in${extra.length ? ` · ${extra.join(' · ')}` : ''}`)
  }
  if (d.cover.lessons > 0) {
    lines.push(
      d.cover.open > 0
        ? `🔁 Cover: ${plural(d.cover.open, 'period')} still need a substitute (${d.cover.arranged} arranged)`
        : `🔁 Cover: all ${plural(d.cover.lessons, 'period')} arranged`,
    )
  }
  const pending = pendingLine(d.pending)
  if (pending) lines.push(pending)
  if (d.events.length) lines.push(`📅 Today: ${d.events.slice(0, 3).join(' · ')}`)
  if (lines.length === 0) lines.push('Nothing to report yet.')
  lines.push('', `Open: ${link}`)
  return { title: `☀️ Good morning — ${d.school} · ${d.dayLabel}`, body: lines.join('\n') }
}

export function formatEveningDigest(d: EveningData, link: string): { title: string; body: string } {
  const money = (minor: number) => formatMoney(minor, d.currency)
  const lines: string[] = []
  const c = d.collected
  lines.push(
    c.receipts > 0
      ? `💰 Collected today: ${money(c.totalMinor)} (${plural(c.receipts, 'receipt')})`
      : '💰 No fees collected today',
  )
  const modes = c.byMode
    .filter((m) => m.amountMinor > 0)
    .sort((a, b) => b.amountMinor - a.amountMinor)
    .map((m) => `${MODE_LABEL[m.mode] ?? m.mode} ${money(m.amountMinor)}`)
  if (modes.length > 1) lines.push(`    ${modes.join(' · ')}`)
  lines.push(
    `📉 Dues outstanding: ${money(d.dues.outstandingMinor)}${d.dues.overdueMinor > 0 ? ` (overdue ${money(d.dues.overdueMinor)})` : ''}`,
  )
  if (d.expensesMinor > 0) lines.push(`🧾 Expenses today: ${money(d.expensesMinor)}`)
  const a = d.attendance
  lines.push(
    `👥 Attendance: students ${a.studentPercent == null ? 'not marked' : `${a.studentPercent}%`} · staff ${a.staffPresent}/${a.staffActive}`,
  )
  if (d.gate.earlyExits || d.gate.visitors) {
    lines.push(`🚪 ${plural(d.gate.earlyExits, 'early exit')} · ${plural(d.gate.visitors, 'visitor')}`)
  }
  const pending = pendingLine(d.pending)
  if (pending) lines.push(pending)
  lines.push('', `Open: ${link}`)
  return { title: `🌇 Day summary — ${d.school} · ${d.dayLabel}`, body: lines.join('\n') }
}
