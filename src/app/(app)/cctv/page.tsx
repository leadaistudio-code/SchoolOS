import Link from 'next/link'
import { Settings } from 'lucide-react'
import { requireContext } from '@/server/context'
import { viewerState } from '@/server/modules/cctv/service'
import { ColorBanner } from '@/components/dashboard/color-tiles'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { EmptyState } from '@/components/ui/states'
import { LiveGrid } from './live-grid'

export const metadata = { title: 'Live CCTV' }
export const dynamic = 'force-dynamic'

export default async function CctvPage() {
  const ctx = await requireContext()
  const state = await viewerState(ctx)
  const canManage = ctx.can('cctv.manage')

  const description = state.parent
    ? `Your child's classroom, live. Available ${state.parent.label} (India time).`
    : ctx.can('cctv.view_all')
      ? 'Every camera in the school, live from the recorder.'
      : 'Gate and entrance cameras, live.'

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="transport"
        eyebrow="CCTV"
        title={state.site.name}
        description={description}
        actions={
          <div className="flex items-center gap-2">
            {state.parent?.open ? (
              <Badge tone="success" className="bg-white/90">
                Open until {state.parent.closesAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
              </Badge>
            ) : null}
            {canManage ? (
              <Link href="/settings/cctv" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <Settings className="size-4" aria-hidden /> Set up
              </Link>
            ) : null}
          </div>
        }
      />
      {state.cameras.length === 0 ? (
        <EmptyState
          title="No live cameras right now"
          description={state.emptyReason ?? 'Nothing to show.'}
          action={
            canManage ? (
              <Link href="/settings/cctv" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
                Connect your CCTV
              </Link>
            ) : undefined
          }
        />
      ) : (
        <LiveGrid cameras={state.cameras} />
      )}
      <p className="text-xs text-ink-subtle">
        Video comes straight from the school&apos;s own recorder and is never stored by MyCampusView. Every time someone opens this page it is
        written to the audit log.
      </p>
    </div>
  )
}
