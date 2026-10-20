import React from 'react'
import { AppState, View } from 'react-native'
import { router } from 'expo-router'
import { ScreenHeader, SectionTitle } from '@/components/header'
import { Badge, Button, Card, Screen, SkeletonList, Txt } from '@/components/ui'
import { useAuth } from '@/auth/store'
import { colors, spacing } from '@/theme'
import { CAPABILITY_LABEL, RESTRICTION_EXPLANATION, RESTRICTION_LABEL, type RestrictionLevel } from '@/tapasya/device'
import { deviceReport, getDeviceStatus, runSetupStep, type DeviceStatus } from '@/tapasya/device-control'
import { useReportDevice } from '@/tapasya/api'

const LEVELS: RestrictionLevel[] = ['TIMER_ONLY', 'PARTIAL', 'APP_SHIELDING', 'MANAGED_KIOSK']

/** What this phone can actually do, checked live, and how to enable more. */
export default function TapasyaDeviceScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const report = useReportDevice()
  const [status, setStatus] = React.useState<DeviceStatus | null>(null)

  const check = React.useCallback(async () => {
    const s = await getDeviceStatus()
    setStatus(s)
    report.mutate(await deviceReport(s))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    void check()
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') void check() })
    return () => sub.remove()
  }, [check])

  return (
    <Screen scroll padded={false} header={<ScreenHeader title="Phone controls" subtitle="Checked on this phone just now" tint={brand} onBack={() => router.back()} />}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
        {!status ? <SkeletonList rows={3} /> : (
          <>
            <Card>
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Badge label={CAPABILITY_LABEL[status.capabilityState]} tone={status.capabilityState.startsWith('READY') ? 'success' : status.capabilityState === 'FAILED' ? 'danger' : 'warning'} />
                <Badge label={`Best available: ${RESTRICTION_LABEL[status.bestLevel]}`} tone="info" />
              </View>
              <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>{RESTRICTION_EXPLANATION[status.bestLevel]}</Txt>
            </Card>

            {status.setup.length ? <SectionTitle tint={brand}>To do more</SectionTitle> : null}
            {status.setup.map((step, i) => (
              <Card key={i}>
                <Txt variant="small">{step.label}</Txt>
                {step.kind !== 'INFO' ? <Button label="Set up" variant="secondary" onPress={() => void runSetupStep(step).then(check)} style={{ marginTop: spacing.sm }} /> : null}
              </Card>
            ))}
          </>
        )}

        <SectionTitle tint={brand}>What each level means</SectionTitle>
        {LEVELS.map((l) => (
          <Card key={l}>
            <Txt variant="bodyStrong">{RESTRICTION_LABEL[l]}</Txt>
            <Txt variant="small" color={colors.textMuted}>{RESTRICTION_EXPLANATION[l]}</Txt>
          </Card>
        ))}
        <Txt variant="caption" color={colors.textSubtle}>Emergency calls always remain available. The level a session reached is recorded honestly and never changes your XP.</Txt>
      </View>
    </Screen>
  )
}
