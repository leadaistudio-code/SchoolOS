import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'
import QRCode from 'qrcode'
import { requireContext } from '@/server/context'
import { getGatePass } from '@/server/modules/front-office/gate-pass'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { PrintButton } from '@/app/(app)/finance/payments/[id]/print-button'
import { CancelPassButton, OtpPanel } from '../issue-form'
import { STATUS_BADGE } from '../status'

export const metadata = { title: 'Gate pass' }

export default async function GatePassPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('frontoffice.view')
  const { id } = await params
  const pass = await getGatePass(ctx, id)
  const e = pass.student.enrollments[0]
  const badge = STATUS_BADGE[pass.status]
  const qr = await QRCode.toDataURL(pass.token, { margin: 1, width: 240 })
  const canIssue = ctx.can('frontoffice.gatepass')

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex items-center justify-between gap-2">
        <Link href="/front-office/gate-passes" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="size-4" aria-hidden /> All passes
        </Link>
        <div className="flex items-center gap-2">
          {canIssue && (pass.status === 'AWAITING_OTP' || pass.status === 'APPROVED') ? <CancelPassButton id={pass.id} /> : null}
          {pass.status === 'APPROVED' ? <PrintButton /> : null}
        </div>
      </div>

      {pass.status === 'AWAITING_OTP' && canIssue ? (
        <Card variant="elevated" className="no-print">
          <CardHeader>
            <CardTitle>Waiting for the parent’s code</CardTitle>
          </CardHeader>
          <CardContent>
            <OtpPanel id={pass.id} sentTo={pass.otpSentTo} />
          </CardContent>
        </Card>
      ) : null}

      <Card variant="elevated" className="overflow-hidden print:border-2 print:border-black print:shadow-none">
        <div className="flex items-center justify-between gap-2 border-b border-line bg-bg px-5 py-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-subtle">{ctx.tenant.name}</p>
            <p className="text-lg font-semibold text-ink">Student gate pass</p>
          </div>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        <CardContent className="grid gap-5 p-5 sm:grid-cols-[1fr_auto]">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-subtle">Pass no.</dt>
            <dd className="font-mono font-medium text-ink">{pass.passNumber}</dd>
            <dt className="text-ink-subtle">Student</dt>
            <dd className="font-medium text-ink">
              {pass.student.firstName} {pass.student.lastName}
            </dd>
            <dt className="text-ink-subtle">Class</dt>
            <dd className="text-ink">
              {e ? `${e.classLevel.name} ${e.section.name}` : '—'} · {pass.student.admissionNo}
            </dd>
            <dt className="text-ink-subtle">Collected by</dt>
            <dd className="text-ink">
              {pass.pickupName}
              {pass.pickupRelation ? ` (${pass.pickupRelation})` : ''}
            </dd>
            <dt className="text-ink-subtle">Reason</dt>
            <dd className="text-ink">{pass.reason}</dd>
            <dt className="text-ink-subtle">Approved</dt>
            <dd className="text-ink">
              {pass.approvedAt
                ? `${format(pass.approvedAt, 'd MMM yyyy, HH:mm')} · ${pass.verification === 'OTP' ? 'parent code' : 'in person'}`
                : '—'}
            </dd>
            <dt className="text-ink-subtle">Issued by</dt>
            <dd className="text-ink">{pass.issuedByLabel ?? '—'}</dd>
            {pass.exitedAt ? (
              <>
                <dt className="text-ink-subtle">Left gate</dt>
                <dd className="text-ink">
                  {format(pass.exitedAt, 'HH:mm')}
                  {pass.exitedByLabel ? ` · checked by ${pass.exitedByLabel}` : ''}
                </dd>
              </>
            ) : null}
            {pass.cancelReason ? (
              <>
                <dt className="text-ink-subtle">Cancelled</dt>
                <dd className="text-ink">{pass.cancelReason}</dd>
              </>
            ) : null}
          </dl>
          {pass.status === 'APPROVED' ? (
            <div className="flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Gate pass QR code" className="size-40" />
              <p className="text-center text-xs text-ink-subtle">Show at the gate · valid today only</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
