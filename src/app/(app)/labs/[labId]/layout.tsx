import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireLabs } from '@/server/modules/labs/access'
import { getLab } from '@/server/modules/labs/service'
import { labelOf, LAB_TYPES } from '@/lib/labs/types'
import { LabTabs } from './lab-tabs'

export default async function LabLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ labId: string }>
}) {
  const { labId } = await params
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId).catch(() => null)
  if (!lab) notFound()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/labs" className="text-xs text-ink-muted hover:underline">
            ← All labs
          </Link>
          <h1 className="text-xl font-semibold text-ink">{lab.name}</h1>
          <p className="text-sm text-ink-muted">
            {labelOf(LAB_TYPES, lab.type)}
            {lab.room ? ` · ${lab.room}` : ''}
          </p>
        </div>
      </div>
      <LabTabs labId={lab.id} />
      {children}
    </div>
  )
}
