import React from 'react'
import { Alert, FlatList, Pressable, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useAttendanceRegister, useMarkAttendance } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { Badge, Button, ErrorState, Screen, SkeletonList, Txt } from '@/components/ui'
import { longDate } from '@/lib/format'
import { colors, layout, radius, spacing } from '@/theme'
import type { AttendanceStatus, RegisterRow } from '@/api/types'

/**
 * Taking the register.
 *
 * The whole point of this screen is that a teacher marks thirty children in
 * well under a minute, standing up, one-handed. So:
 *
 *  - everybody starts Present, because on a normal day almost everybody is,
 *    and marking the four exceptions beats confirming the twenty-six rules;
 *  - status is a segmented control on the row itself, so a change is one tap
 *    with no sheet to open and dismiss;
 *  - the save is one request for the whole section, matching the API, which
 *    writes it in a single transaction — a half-saved register reads as though
 *    the missing children simply were not absent.
 */

const QUICK: { value: AttendanceStatus; label: string; tint: string }[] = [
  { value: 'PRESENT', label: 'P', tint: colors.success },
  { value: 'ABSENT', label: 'A', tint: colors.danger },
  { value: 'LATE', label: 'L', tint: colors.warning },
  { value: 'LEAVE', label: 'Lv', tint: colors.info },
]

export default function RegisterScreen() {
  const { sectionId, onDate } = useLocalSearchParams<{ sectionId: string; onDate: string }>()
  const can = useAuth((s) => s.can)
  const { data, isLoading, error, refetch } = useAttendanceRegister(sectionId ?? '', onDate ?? '')
  const mark = useMarkAttendance(sectionId ?? '', onDate ?? '')

  const [marks, setMarks] = React.useState<Record<string, AttendanceStatus>>({})
  const [dirty, setDirty] = React.useState(false)

  // Seeded once the register arrives: whatever was already saved is kept, and
  // anyone unmarked defaults to Present.
  React.useEffect(() => {
    if (!data) return
    const seed: Record<string, AttendanceStatus> = {}
    for (const row of data.rows) {
      seed[row.studentId] = row.status ?? (row.onApprovedLeave ? 'LEAVE' : 'PRESENT')
    }
    setMarks(seed)
    setDirty(false)
  }, [data])

  const editable = (data?.editable ?? false) && can('attendance.mark')

  const tally = React.useMemo(() => {
    const t = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 } as Record<string, number>
    for (const v of Object.values(marks)) t[v] = (t[v] ?? 0) + 1
    return t
  }, [marks])

  function set(studentId: string, status: AttendanceStatus) {
    if (!editable) return
    Haptics.selectionAsync().catch(() => {})
    setMarks((m) => ({ ...m, [studentId]: status }))
    setDirty(true)
  }

  async function save() {
    const entries = Object.entries(marks).map(([studentId, status]) => ({ studentId, status }))
    try {
      await mark.mutateAsync(entries)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setDirty(false)
      router.back()
    } catch (err) {
      Alert.alert(
        'Could not save the register',
        err instanceof ApiError ? err.message : 'Please try again.',
      )
    }
  }

  if (isLoading) {
    return <Screen><SkeletonList rows={10} /></Screen>
  }

  if (error || !data) {
    return (
      <Screen>
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load this register.'}
          onRetry={refetch}
        />
      </Screen>
    )
  }

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.md }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.brand} />
          <Txt variant="smallStrong" color={colors.brand}>Registers</Txt>
        </Pressable>

        <Txt variant="h1" style={{ marginTop: spacing.sm }} accessibilityRole="header">
          {data.section.className} {data.section.name}
        </Txt>
        <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 2 }}>
          {longDate(data.onDate)} · {data.rows.length} students
        </Txt>

        {!editable ? (
          <View style={{ marginTop: spacing.md }}>
            <Badge
              label={data.lockedReason ?? (can('attendance.mark') ? 'Locked for editing' : 'You may view but not mark')}
              tone="neutral"
            />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <Tally label="Present" value={tally.PRESENT ?? 0} tint={colors.success} />
            <Tally label="Absent" value={tally.ABSENT ?? 0} tint={colors.danger} />
            <Tally label="Late" value={tally.LATE ?? 0} tint={colors.warning} />
            <Tally label="Leave" value={tally.LEAVE ?? 0} tint={colors.info} />
          </View>
        )}
      </View>

      <FlatList
        data={data.rows}
        keyExtractor={(r) => r.studentId}
        contentContainerStyle={{ paddingBottom: editable ? 110 : spacing.xxl }}
        renderItem={({ item }) => (
          <Row row={item} value={marks[item.studentId] ?? 'PRESENT'} editable={editable} onChange={set} />
        )}
      />

      {editable ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: spacing.base,
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Button
            label={dirty || !data.markedAt ? 'Save register' : 'Saved'}
            onPress={save}
            loading={mark.isPending}
            disabled={!dirty && !!data.markedAt}
          />
        </View>
      ) : null}
    </Screen>
  )
}

function Tally({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center' }}>
      <Txt variant="bodyStrong" color={tint}>{value}</Txt>
      <Txt variant="caption" color={colors.textSubtle}>{label}</Txt>
    </View>
  )
}

/** Memoised: without it, one tap re-renders all thirty rows. */
const Row = React.memo(function Row({
  row,
  value,
  editable,
  onChange,
}: {
  row: RegisterRow
  value: AttendanceStatus
  editable: boolean
  onChange: (studentId: string, status: AttendanceStatus) => void
}) {
  const name = `${row.firstName} ${row.lastName}`.trim()

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.base,
        paddingVertical: spacing.md,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ width: 30 }}>
        <Txt variant="small" color={colors.textSubtle}>{row.rollNumber ?? '—'}</Txt>
      </View>

      <View style={{ flex: 1, paddingRight: spacing.sm }}>
        <Txt variant="bodyStrong" numberOfLines={1}>{name}</Txt>
        {row.onApprovedLeave ? (
          <Txt variant="caption" color={colors.info} style={{ marginTop: 2 }}>Approved leave</Txt>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`Attendance for ${name}`}>
        {QUICK.map((opt) => {
          const active = value === opt.value
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(row.studentId, opt.value)}
              disabled={!editable}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: !editable }}
              accessibilityLabel={`${opt.value.toLowerCase()} for ${name}`}
              style={{
                width: 38,
                height: layout.tapTarget - 8,
                borderRadius: radius.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? opt.tint : colors.surfaceSunken,
                opacity: editable ? 1 : 0.6,
              }}
            >
              <Txt variant="smallStrong" color={active ? colors.textOnDark : colors.textSubtle}>
                {opt.label}
              </Txt>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
})
