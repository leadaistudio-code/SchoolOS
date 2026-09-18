import React from 'react'
import { Alert, FlatList, Pressable, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import {
  useExamAttendanceDesk,
  useMarkExamAttendance,
  useScanExamAttendance,
} from '@/api/hooks'
import { ApiError } from '@/api/client'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Screen,
  SkeletonList,
  Springy,
  Txt,
} from '@/components/ui'
import { useAuth } from '@/auth/store'
import { fullName, longDate } from '@/lib/format'
import { BarcodeScannerModal } from '@/components/barcode-scanner'
import { colors, layout, radius, spacing } from '@/theme'
import type { ExamAttendanceRow } from '@/api/types'

/**
 * Exam attendance desk for one date.
 *
 * Mirrors the web date-based desk: pick a sitting day, scan with the camera,
 * paste a barcode, or tap Present / Absent on a student row.
 */
export default function ExamAttendanceScreen() {
  const { examId, name } = useLocalSearchParams<{ examId: string; name?: string }>()
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const [examDate, setExamDate] = React.useState<string | undefined>(undefined)
  const [barcode, setBarcode] = React.useState('')
  const [filter, setFilter] = React.useState('')
  const [scannerOpen, setScannerOpen] = React.useState(false)

  const { data, isLoading, isRefetching, refetch, error } = useExamAttendanceDesk(
    examId ?? '',
    examDate,
  )
  const scan = useScanExamAttendance(examId ?? '')
  const mark = useMarkExamAttendance(examId ?? '')

  React.useEffect(() => {
    if (data?.selectedDate && !examDate) setExamDate(data.selectedDate)
  }, [data?.selectedDate, examDate])

  const selected = examDate ?? data?.selectedDate ?? null

  const rows = React.useMemo(() => {
    const list = data?.rows ?? []
    const q = filter.trim().toLowerCase()
    if (!q) return list
    return list.filter((row) => {
      const n = fullName(row.student.firstName, row.student.lastName).toLowerCase()
      return (
        n.includes(q) ||
        row.student.admissionNo.toLowerCase().includes(q) ||
        row.admitCardNumber.toLowerCase().includes(q)
      )
    })
  }, [data?.rows, filter])

  const present = (data?.rows ?? []).filter((r) => r.attendance?.status === 'PRESENT').length
  const total = data?.rows?.length ?? 0

  async function onScanValue(raw: string) {
    if (!selected || !raw.trim()) return
    setScannerOpen(false)
    try {
      const result = await scan.mutateAsync({ examDate: selected, barcode: raw.trim() })
      await Haptics.notificationAsync(
        result.duplicate
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success,
      )
      setBarcode('')
      Alert.alert(
        result.duplicate ? 'Already checked in' : 'Checked in',
        `${result.studentName}${result.papersTotal > 1 ? ` · ${result.papersTotal} papers` : ''}`,
      )
    } catch (err) {
      Alert.alert(
        'Scan failed',
        err instanceof ApiError ? err.message : 'Could not accept that barcode.',
      )
    }
  }

  async function onScan() {
    await onScanValue(barcode)
  }

  function onMark(row: ExamAttendanceRow, status: 'PRESENT' | 'ABSENT') {
    if (!selected) return
    const label = fullName(row.student.firstName, row.student.lastName)
    Alert.alert(
      status === 'PRESENT' ? 'Mark present?' : 'Mark absent?',
      label,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'PRESENT' ? 'Present' : 'Absent',
          style: status === 'ABSENT' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await mark.mutateAsync({
                examDate: selected,
                studentId: row.student.id,
                status,
              })
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            } catch (err) {
              Alert.alert(
                'Could not save',
                err instanceof ApiError ? err.message : 'Please try again.',
              )
            }
          },
        },
      ],
    )
  }

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}
        >
          <Ionicons name="chevron-back" size={20} color={brand} />
          <Txt variant="smallStrong" color={brand}>Exams</Txt>
        </Pressable>
        <Txt variant="h2" style={{ marginTop: spacing.sm }} numberOfLines={2}>
          {name || data?.exam.name || 'Exam attendance'}
        </Txt>
        <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 4 }}>
          {selected
            ? `${longDate(selected)} · ${present}/${total} present`
            : 'Pick a date with papers'}
        </Txt>
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.md }}>
          <SkeletonList rows={8} />
        </View>
      ) : error ? (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load the desk.'}
          onRetry={refetch}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.student.id}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
              {(data?.dates.length ?? 0) > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
                  {(data?.dates ?? []).map((d) => {
                    const active = d.key === selected
                    return (
                      <Springy key={d.key} onPress={() => setExamDate(d.key)} accessibilityLabel={d.key}>
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
                            {longDate(d.key)}
                          </Txt>
                          <Txt
                            variant="caption"
                            color={active ? 'rgba(255,255,255,0.85)' : colors.textSubtle}
                          >
                            {d.paperCount} paper{d.paperCount === 1 ? '' : 's'}
                          </Txt>
                        </View>
                      </Springy>
                    )
                  })}
                </View>
              ) : null}

              {selected ? (
                <>
                  <Txt variant="smallStrong" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
                    Admit barcode
                  </Txt>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                    <Button
                      label="Scan camera"
                      onPress={() => setScannerOpen(true)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="Check in"
                      onPress={onScan}
                      loading={scan.isPending}
                      disabled={!barcode.trim()}
                      variant="secondary"
                      style={{ flex: 1 }}
                    />
                  </View>
                  <Input
                    value={barcode}
                    onChangeText={setBarcode}
                    placeholder="Or type / paste card number"
                    autoCapitalize="characters"
                    returnKeyType="done"
                    onSubmitEditing={onScan}
                    style={{ marginBottom: spacing.md }}
                  />
                  <Input
                    value={filter}
                    onChangeText={setFilter}
                    placeholder="Filter by name or admission no."
                    style={{ marginBottom: spacing.md }}
                  />
                </>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              title={selected ? 'No eligible students' : 'No exam dates'}
              body={
                selected
                  ? 'Approved admit cards for papers on this date will appear here.'
                  : 'Add exam dates and papers on the web first.'
              }
            />
          }
          renderItem={({ item }) => {
            const enrollment = item.student.enrollments[0]
            const klass = enrollment
              ? [enrollment.classLevel.name, enrollment.section?.name].filter(Boolean).join(' ')
              : ''
            const status = item.attendance?.status
            return (
              <View
                style={{
                  paddingHorizontal: spacing.base,
                  paddingVertical: spacing.md,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: layout.tapTarget + 12,
                }}
              >
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>
                    {fullName(item.student.firstName, item.student.lastName)}
                  </Txt>
                  <Txt variant="caption" color={colors.textSubtle} numberOfLines={1}>
                    {[item.student.admissionNo, klass].filter(Boolean).join(' · ')}
                  </Txt>
                  {status ? (
                    <View style={{ marginTop: 4 }}>
                      <Badge
                        label={status.toLowerCase()}
                        tone={
                          status === 'PRESENT' ? 'success'
                          : status === 'ABSENT' ? 'danger'
                          : 'warning'
                        }
                      />
                    </View>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                  <MarkChip
                    label="P"
                    active={status === 'PRESENT'}
                    tint={colors.success}
                    onPress={() => onMark(item, 'PRESENT')}
                    disabled={mark.isPending}
                  />
                  <MarkChip
                    label="A"
                    active={status === 'ABSENT'}
                    tint={colors.danger}
                    onPress={() => onMark(item, 'ABSENT')}
                    disabled={mark.isPending}
                  />
                </View>
              </View>
            )
          }}
        />
      )}

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(value) => void onScanValue(value)}
      />
    </Screen>
  )
}

function MarkChip({
  label,
  active,
  tint,
  onPress,
  disabled,
}: {
  label: string
  active: boolean
  tint: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label === 'P' ? 'Present' : 'Absent'}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? tint : colors.surfaceSunken,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Txt variant="bodyStrong" color={active ? '#FFFFFF' : colors.textMuted}>{label}</Txt>
    </Pressable>
  )
}
