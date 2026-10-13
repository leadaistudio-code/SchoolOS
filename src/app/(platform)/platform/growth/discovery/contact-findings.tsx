import { Globe, Mail, MapPin, Phone, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CONTACT_SOURCE_LABELS,
  contactConfidenceLabel,
  hostOf,
  parseContactFindings,
  type ContactFinding,
} from '@/lib/lead-discovery'
import { FindContactsButton } from './discovery-controls'

type Row = {
  id: string
  email: string | null
  phone: string | null
  address: string | null
  website: string | null
  contactPerson?: string | null
  designation?: string | null
  contactConfidence: number
  contactFindings: unknown
  contactCheckedAt: Date | null
}

function ConfidenceBadge({ value }: { value: number }) {
  const { label, tone } = contactConfidenceLabel(value)
  return (
    <Badge tone={tone} className="tnum whitespace-nowrap">
      {value}% · {label}
    </Badge>
  )
}

function hrefFor(kind: 'email' | 'phone' | 'website' | 'address', value: string): string | null {
  if (kind === 'email') return `mailto:${value}`
  if (kind === 'phone') return `tel:${value.replace(/\s/g, '')}`
  if (kind === 'website') return value
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`
}

function FindingRow({
  icon: Icon,
  label,
  kind,
  finding,
  fallback,
}: {
  icon: LucideIcon
  label: string
  kind: 'email' | 'phone' | 'website' | 'address'
  finding: ContactFinding | null
  fallback: string | null
}) {
  const value = finding?.value ?? fallback
  const href = value ? hrefFor(kind, value) : null
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-muted">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-subtle">{label}</p>
        {value ? (
          <a
            href={href ?? undefined}
            target={kind === 'website' || kind === 'address' ? '_blank' : undefined}
            rel="noreferrer"
            className="break-words text-sm font-medium text-ink hover:text-[var(--brand-600)] hover:underline"
          >
            {value}
          </a>
        ) : (
          <p className="text-sm text-ink-subtle">Not found</p>
        )}
        {finding ? (
          <p className="mt-0.5 text-xs text-ink-muted">
            From {CONTACT_SOURCE_LABELS[finding.source]}
            {finding.url ? (
              <>
                {' · '}
                <a href={finding.url} target="_blank" rel="noreferrer" className="text-[var(--brand-600)] hover:underline">
                  {hostOf(finding.url) ?? 'source'}
                </a>
              </>
            ) : null}
            {finding.corroboratedBy > 0
              ? ` · also seen on ${finding.corroboratedBy} other source${finding.corroboratedBy > 1 ? 's' : ''}`
              : ''}
          </p>
        ) : value ? (
          <p className="mt-0.5 text-xs text-ink-muted">Entered earlier · no source recorded</p>
        ) : null}
      </div>
      {finding ? <ConfidenceBadge value={finding.confidence} /> : null}
    </div>
  )
}

/** Detail page: every contact detail found, with its source and confidence. */
export function ContactFindingsCard({ row, canEdit }: { row: Row; canEdit: boolean }) {
  const f = parseContactFindings(row.contactFindings)
  const others = [...(f?.otherPhones ?? []), ...(f?.otherEmails ?? [])]
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Contact details found</CardTitle>
          <p className="text-xs text-ink-muted">
            {row.contactCheckedAt
              ? `Checked ${row.contactCheckedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}${
                  f?.sourcesChecked.length ? ` · searched ${f.sourcesChecked.join(', ')}` : ''
                }`
              : 'Not searched yet. Run a search to look up the email, phone and address.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {f ? (
            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
              Contact confidence <ConfidenceBadge value={row.contactConfidence} />
            </span>
          ) : null}
          {canEdit ? <FindContactsButton id={row.id} label={f ? 'Search again' : 'Find contact details'} /> : null}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-line">
          <FindingRow icon={Mail} label="Email address" kind="email" finding={f?.email ?? null} fallback={row.email} />
          <FindingRow icon={Phone} label="Contact number" kind="phone" finding={f?.phone ?? null} fallback={row.phone} />
          <FindingRow icon={MapPin} label="School address" kind="address" finding={f?.address ?? null} fallback={row.address} />
          <FindingRow icon={Globe} label="Website" kind="website" finding={f?.website ?? null} fallback={row.website} />
          {row.contactPerson ? (
            <div className="flex items-start gap-3 py-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-muted">
                <UserRound className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-xs text-ink-subtle">Contact person</p>
                <p className="text-sm font-medium text-ink">
                  {row.contactPerson}
                  {row.designation ? <span className="font-normal text-ink-muted"> · {row.designation}</span> : null}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        {others.length ? (
          <div className="mt-2 rounded-[var(--radius-sm)] bg-surface-2 p-3">
            <p className="mb-1.5 text-xs font-medium text-ink">Other numbers and emails found</p>
            <ul className="space-y-1">
              {others.map((o) => (
                <li key={o.value} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 break-words text-ink">
                    {o.value}
                    <span className="text-xs text-ink-muted"> · {CONTACT_SOURCE_LABELS[o.source]}</span>
                  </span>
                  <span className="text-xs tnum text-ink-muted">{o.confidence}%</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-ink-subtle">
          Confidence is how sure we are the detail belongs to this school: the school’s own website and its Google Maps
          listing score highest, and a value seen on several sources scores higher. The overall score averages email,
          phone and address, with a missing one counting as 0.
        </p>
      </CardContent>
    </Card>
  )
}

/** List page: compact summary of what was found. */
export function ContactFoundCell({ row }: { row: Row }) {
  const f = parseContactFindings(row.contactFindings)
  const items: { icon: LucideIcon; value: string; confidence: number | null }[] = []
  const add = (icon: LucideIcon, finding: ContactFinding | null | undefined, fallback: string | null) => {
    const value = finding?.value ?? fallback
    if (value) items.push({ icon, value, confidence: finding?.confidence ?? null })
  }
  add(Mail, f?.email, row.email)
  add(Phone, f?.phone, row.phone)
  add(MapPin, f?.address, row.address)

  if (items.length === 0) {
    return <span className="text-xs text-ink-subtle">{row.contactCheckedAt ? 'None found' : 'Not searched yet'}</span>
  }
  return (
    <div className="w-64 max-w-full space-y-0.5">
      {items.map(({ icon: Icon, value, confidence }) => (
        <p key={value} className="flex items-center gap-1.5 text-xs text-ink">
          <Icon className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
          <span className="truncate" title={value}>
            {value}
          </span>
          {confidence !== null ? (
            <span className={`ml-auto shrink-0 tnum ${confidence >= 80 ? 'text-[var(--success)]' : 'text-ink-muted'}`}>
              {confidence}%
            </span>
          ) : null}
        </p>
      ))}
      {f ? <p className="text-[11px] text-ink-subtle">Contact confidence {row.contactConfidence}%</p> : null}
    </div>
  )
}
