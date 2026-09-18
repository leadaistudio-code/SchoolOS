import React from 'react'
import { Pressable, Share, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useReceipt } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { Button, Card, ErrorState, Screen, SkeletonList, Txt } from '@/components/ui'
import { useAuth } from '@/auth/store'
import { fullName, longDate, money } from '@/lib/format'
import { colors, spacing } from '@/theme'

/**
 * Fee receipt after counter collection — view and share as text.
 */
export default function ReceiptScreen() {
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>()
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const school = useAuth((s) => s.session?.tenantName) || 'School'
  const { data, isLoading, error, refetch } = useReceipt(paymentId ?? '')

  async function share() {
    if (!data) return
    const enrollment = data.student.enrollments[0]
    const klass = enrollment
      ? [enrollment.classLevel.name, enrollment.section?.name].filter(Boolean).join(' ')
      : ''
    const lines = [
      school,
      `Receipt ${data.receipt?.number ?? data.id}`,
      '',
      `Student: ${fullName(data.student.firstName, data.student.lastName)}`,
      `Admission: ${data.student.admissionNo}`,
      klass ? `Class: ${klass}` : null,
      `Paid: ${money(data.amountMinor)} · ${data.mode}`,
      `Date: ${longDate(data.paidAt || data.createdAt)}`,
      data.reference ? `Reference: ${data.reference}` : null,
      '',
      ...data.allocations.map(
        (a) =>
          `${a.invoice.number} — ${money(a.amountMinor)} (balance now ${money(a.invoice.balanceMinor)})`,
      ),
      '',
      `Outstanding now: ${money(data.outstandingMinor)}`,
      data.advanceMinor > 0 ? `Advance: ${money(data.advanceMinor)}` : null,
    ].filter(Boolean)

    await Share.share({ message: lines.join('\n'), title: `Receipt ${data.receipt?.number ?? ''}` })
  }

  if (isLoading) {
    return (
      <Screen>
        <SkeletonList rows={6} />
      </Screen>
    )
  }

  if (error || !data) {
    return (
      <Screen>
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load receipt.'}
          onRetry={refetch}
        />
      </Screen>
    )
  }

  const enrollment = data.student.enrollments[0]
  const klass = enrollment
    ? [enrollment.classLevel.name, enrollment.section?.name].filter(Boolean).join(' ')
    : ''
  const guardian = data.student.guardians[0]?.parent

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}
        >
          <Ionicons name="chevron-back" size={20} color={brand} />
          <Txt variant="smallStrong" color={brand}>Back</Txt>
        </Pressable>

        <Txt variant="h2" style={{ marginTop: spacing.sm }}>Receipt</Txt>
        <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 4 }}>
          {data.receipt?.number ?? '—'} · {longDate(data.paidAt || data.createdAt)}
        </Txt>

        <Card style={{ marginTop: spacing.lg }}>
          <Txt variant="caption" color={colors.textSubtle}>{school}</Txt>
          <Txt variant="metric" style={{ marginTop: spacing.sm }}>{money(data.amountMinor)}</Txt>
          <Txt variant="small" color={colors.textMuted} style={{ marginTop: 4 }}>
            {data.mode}{data.reference ? ` · ${data.reference}` : ''}
          </Txt>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Txt variant="bodyStrong">{fullName(data.student.firstName, data.student.lastName)}</Txt>
          <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 2 }}>
            {[data.student.admissionNo, klass].filter(Boolean).join(' · ')}
          </Txt>
          {guardian ? (
            <Txt variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
              Parent: {fullName(guardian.firstName, guardian.lastName)}
            </Txt>
          ) : null}
        </Card>

        {data.allocations.length > 0 ? (
          <View style={{ marginTop: spacing.lg }}>
            <Txt variant="smallStrong" color={colors.textSubtle} style={{ marginBottom: spacing.sm }}>
              APPLIED TO
            </Txt>
            {data.allocations.map((a, i) => (
              <Card key={`${a.invoice.number}-${i}`} style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                    {a.invoice.number}
                  </Txt>
                  <Txt variant="bodyStrong">{money(a.amountMinor)}</Txt>
                </View>
                <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: 2 }}>
                  {a.invoice.title} · balance now {money(a.invoice.balanceMinor)}
                </Txt>
              </Card>
            ))}
          </View>
        ) : null}

        <Card style={{ marginTop: spacing.md }}>
          <Row label="Outstanding now" value={money(data.outstandingMinor)} />
          {data.advanceMinor > 0 ? <Row label="Advance" value={money(data.advanceMinor)} /> : null}
          {data.collectedBy ? (
            <Row
              label="Collected by"
              value={fullName(data.collectedBy.firstName, data.collectedBy.lastName)}
            />
          ) : null}
        </Card>

        <Button label="Share receipt" onPress={() => void share()} style={{ marginTop: spacing.xl }} />
      </View>
    </Screen>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
      <Txt variant="small" color={colors.textSubtle} style={{ flex: 1 }}>{label}</Txt>
      <Txt variant="smallStrong">{value}</Txt>
    </View>
  )
}
