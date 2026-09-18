import React from 'react'
import { Alert, Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useApplyLeave, useLeaveTypes } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { Button, Field, Input, Screen, SkeletonList, Springy, Txt } from '@/components/ui'
import { useAuth } from '@/auth/store'
import { apiDate } from '@/lib/format'
import { colors, radius, spacing } from '@/theme'

/**
 * Staff apply for their own leave from the phone.
 */
export default function LeaveApplyScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const canApply = useAuth((s) => s.can('leave.apply'))
  const types = useLeaveTypes('STAFF')
  const apply = useApplyLeave()

  const today = apiDate(new Date())
  const [leaveTypeId, setLeaveTypeId] = React.useState<string | undefined>()
  const [fromDate, setFromDate] = React.useState(today)
  const [toDate, setToDate] = React.useState(today)
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    if (!leaveTypeId && types.data?.[0]) setLeaveTypeId(types.data[0].id)
  }, [types.data, leaveTypeId])

  async function submit() {
    if (reason.trim().length < 5) {
      Alert.alert('Reason needed', 'Please write at least a short reason (5+ characters).')
      return
    }
    try {
      await apply.mutateAsync({
        applicantType: 'STAFF',
        leaveTypeId,
        fromDate,
        toDate,
        reason: reason.trim(),
      })
      Alert.alert('Leave requested', 'Your request has been sent for approval.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (err) {
      Alert.alert(
        'Could not apply',
        err instanceof ApiError ? err.message : 'Please try again.',
      )
    }
  }

  if (!canApply) {
    return (
      <Screen>
        <Txt variant="body">You do not have permission to apply for leave.</Txt>
      </Screen>
    )
  }

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}
        >
          <Ionicons name="chevron-back" size={20} color={brand} />
          <Txt variant="smallStrong" color={brand}>Leave</Txt>
        </Pressable>
        <Txt variant="h2" style={{ marginTop: spacing.sm }}>Apply for leave</Txt>

        {types.isLoading ? (
          <SkeletonList rows={4} />
        ) : (
          <>
            <Txt variant="smallStrong" color={colors.textMuted} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
              Leave type
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.base }}>
              {(types.data ?? []).map((t) => {
                const active = leaveTypeId === t.id
                return (
                  <Springy key={t.id} onPress={() => setLeaveTypeId(t.id)} accessibilityLabel={t.name}>
                    <View
                      style={{
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        borderRadius: radius.base,
                        backgroundColor: active ? brand : colors.surface,
                        borderWidth: 1,
                        borderColor: active ? brand : colors.border,
                      }}
                    >
                      <Txt variant="caption" color={active ? '#FFFFFF' : colors.textMuted}>
                        {t.name}{t.isPaid ? '' : ' (unpaid)'}
                      </Txt>
                    </View>
                  </Springy>
                )
              })}
            </View>

            <Field label="From (YYYY-MM-DD)" hint="Use the school calendar date">
              <Input value={fromDate} onChangeText={setFromDate} autoCapitalize="none" />
            </Field>
            <Field label="To (YYYY-MM-DD)">
              <Input value={toDate} onChangeText={setToDate} autoCapitalize="none" />
            </Field>
            <Field label="Reason">
              <Input
                value={reason}
                onChangeText={setReason}
                placeholder="Why you need leave"
                multiline
                style={{ minHeight: 88, textAlignVertical: 'top' }}
              />
            </Field>

            <Button label="Submit request" onPress={() => void submit()} loading={apply.isPending} />
          </>
        )}
      </View>
    </Screen>
  )
}
