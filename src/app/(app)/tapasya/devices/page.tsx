import { PageHeader } from '@/components/page-header'
import { Card, CardContent, Section } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { devicesFor } from '@/server/modules/tapasya/dashboard'
import { CAPABILITY_LABEL, RESTRICTION_EXPLANATION, RESTRICTION_LABEL, type CapabilityState, type RestrictionLevel } from '@/lib/tapasya/device'
import { formatWhen } from '../_components/format'
import { StudentTabs } from '../_components/student-tabs'
import { requireStudentPage } from '../_components/student-page'

export const metadata = { title: 'Device controls · Tapasya' }

const LEVELS: RestrictionLevel[] = ['TIMER_ONLY', 'PARTIAL', 'APP_SHIELDING', 'MANAGED_KIOSK']

const REQUIREMENTS: Record<RestrictionLevel, string> = {
  TIMER_ONLY: 'Any phone, tablet or browser.',
  PARTIAL: 'Android: allow MyCampusView to manage Do Not Disturb. The app can also pin its own screen, which you can unpin at any time.',
  APP_SHIELDING: 'iPhone or iPad with Screen Time authorisation (Family Controls), in a build of the app that carries Apple’s Family Controls entitlement.',
  MANAGED_KIOSK: 'A school-managed device enrolled in device management that allows MyCampusView to run in Lock Task Mode (Android) or Single App Mode (iOS).',
}

export default async function TapasyaDevicesPage() {
  const { ctx, student } = await requireStudentPage()
  const devices = await devicesFor(ctx, student.userId)
  return (
    <div>
      <PageHeader title="Device controls" description={`${devices.length} device${devices.length === 1 ? '' : 's'} reported`} />
      <StudentTabs active="/tapasya/devices" />

      <Notice tone="info" className="mb-5" title="What Tapasya can and cannot lock">
        Each session shows exactly what your device confirmed. Emergency calls and essential phone functions always stay available. Restriction level never changes the XP you earn.
      </Notice>

      <Section title="Your devices" description="Reported by the MyCampusView mobile app.">
        {devices.length === 0 ? (
          <Card><EmptyState title="No phone reported yet" description="Open Tapasya in the MyCampusView mobile app to check what your phone supports." /></Card>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {devices.map((d) => (
              <Card key={d.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{d.platform === 'ios' ? 'iPhone / iPad' : d.platform === 'android' ? 'Android' : 'Browser'}{d.osVersion ? ` ${d.osVersion}` : ''}</span>
                    <Badge tone={d.capabilityState === 'FAILED' ? 'danger' : d.capabilityState.startsWith('READY') || d.capabilityState === 'ACTIVE' ? 'success' : 'warning'}>
                      {CAPABILITY_LABEL[d.capabilityState as CapabilityState] ?? d.capabilityState}
                    </Badge>
                    {d.managed ? <Badge tone="info">School-managed</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-ink-subtle">Last checked {formatWhen(d.lastReportedAt)}{d.appVersion ? ` · app ${d.appVersion}` : ''}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title="Restriction levels" className="mt-5">
        <div className="grid gap-2 md:grid-cols-2">
          {LEVELS.map((l) => (
            <Card key={l}>
              <CardContent className="pt-4 pb-4">
                <Badge tone={l === 'TIMER_ONLY' ? 'neutral' : 'brand'}>{RESTRICTION_LABEL[l]}</Badge>
                <p className="mt-2 text-sm text-ink">{RESTRICTION_EXPLANATION[l]}</p>
                <p className="mt-1 text-xs text-ink-muted">Needs: {REQUIREMENTS[l]}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  )
}
