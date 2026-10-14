import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { ReceiptText, ShieldCheck, ShieldX } from 'lucide-react'
import { resolveTenant } from '@/server/tenant'
import { rateLimit } from '@/server/rate-limit'
import { openReceiptLink, type LinkResult } from '@/server/modules/whatsapp-receipts/link'
import { formatReceiptAmount, formatReceiptDate } from '@/server/modules/whatsapp-receipts/pure'
import { PrintButton } from '@/app/(app)/finance/payments/[id]/print-button'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Fee receipt',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

const MESSAGES: Record<Exclude<LinkResult, { ok: true }>['reason'] | 'busy', { title: string; body: string }> = {
  invalid: { title: 'This link is not valid', body: 'It may be incomplete. Ask the school office for a copy of the receipt.' },
  expired: { title: 'This link has expired', body: 'Receipt links work for 7 days. Ask the school office for a copy, or sign in to the parent app.' },
  unavailable: { title: 'This receipt is not available', body: 'The payment may have been cancelled or refunded. Please contact the school office.' },
  busy: { title: 'Too many requests', body: 'Please wait a minute and try again.' },
}

export default async function ReceiptLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown'
  const tenant = await resolveTenant()

  let result: LinkResult | { ok: false; reason: 'busy' }
  if (!(await rateLimit(`receipt-link:${ip}`, 30, 300)).ok) result = { ok: false, reason: 'busy' }
  else if (!tenant || token.length > 120) result = { ok: false, reason: 'invalid' }
  else result = await openReceiptLink(tenant.id, token)

  const schoolName = tenant?.school?.name ?? tenant?.name ?? 'School'

  return (
    <div className="min-h-dvh bg-bg px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        {!result.ok ? (
          <div role="alert" className="flex gap-3 rounded-[var(--radius)] border border-line bg-surface p-6">
            <ShieldX className="size-5 shrink-0 text-[var(--danger)]" aria-hidden />
            <div>
              <p className="font-medium text-ink">{MESSAGES[result.reason].title}</p>
              <p className="mt-1 text-sm text-ink-muted">{MESSAGES[result.reason].body}</p>
            </div>
          </div>
        ) : (
          <div className="receipt-document rounded-[var(--radius-lg)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] print:border-0 print:shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
              <div className="flex items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-[var(--radius)] bg-[var(--product-500)] text-white print:border print:border-line print:bg-white print:text-ink">
                  <ReceiptText className="size-6" aria-hidden />
                </div>
                <div>
                  <p className="text-lg font-semibold text-ink">{schoolName}</p>
                  <p className="text-xs text-ink-muted">Fee payment receipt</p>
                </div>
              </div>
              <div className="no-print">
                <PrintButton />
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-ink-subtle">Receipt number</dt>
                <dd className="font-semibold text-ink tnum">{result.receipt.number}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-subtle">Payment date</dt>
                <dd className="font-medium text-ink">{formatReceiptDate(result.receipt.paidAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-subtle">Student</dt>
                <dd className="font-medium text-ink">{result.receipt.studentName}</dd>
                <dd className="text-xs text-ink-muted">
                  {result.receipt.admissionNo}
                  {result.receipt.classLabel ? ` · ${result.receipt.classLabel}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-subtle">Paid by</dt>
                <dd className="font-medium capitalize text-ink">{result.receipt.mode.toLowerCase().replaceAll('_', ' ')}</dd>
                {result.receipt.reference ? <dd className="text-xs text-ink-muted tnum">Ref. {result.receipt.reference}</dd> : null}
              </div>
            </dl>

            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="py-2 font-semibold">Towards</th>
                  <th className="py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {result.receipt.lines.map((line) => (
                  <tr key={line.invoice}>
                    <td className="py-2.5">
                      <span className="block text-ink">{line.title}</span>
                      <span className="text-xs text-ink-subtle tnum">{line.invoice}</span>
                    </td>
                    <td className="py-2.5 text-right text-ink tnum">{formatReceiptAmount(line.amountMinor, result.receipt.currency)}</td>
                  </tr>
                ))}
                {result.receipt.advanceMinor > 0 ? (
                  <tr>
                    <td className="py-2.5 text-ink">Advance for future fees</td>
                    <td className="py-2.5 text-right text-ink tnum">{formatReceiptAmount(result.receipt.advanceMinor, result.receipt.currency)}</td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td className="pt-3 font-semibold text-ink">Total received</td>
                  <td className="pt-3 text-right text-lg font-semibold text-ink tnum">{formatReceiptAmount(result.receipt.amountMinor, result.receipt.currency)}</td>
                </tr>
              </tfoot>
            </table>

            <p className="mt-6 flex items-center gap-1.5 border-t border-line pt-4 text-xs text-ink-muted">
              <ShieldCheck className="size-4 text-success" aria-hidden />
              Computer-generated receipt from the school&apos;s fee records. This link expires on {formatReceiptDate(result.receipt.expiresAt)}.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
