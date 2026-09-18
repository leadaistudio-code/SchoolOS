import React from 'react'
import { Alert, FlatList, Pressable, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useMarksRoster, useSaveMarks } from '@/api/hooks'
import { ApiError } from '@/api/client'
import {
  Badge,
  Button,
  ErrorState,
  Input,
  Screen,
  SkeletonList,
  Txt,
} from '@/components/ui'
import { useAuth } from '@/auth/store'
import { fullName } from '@/lib/format'
import { colors, layout, radius, spacing } from '@/theme'

type Draft = {
  marksObtained: string
  isAbsent: boolean
}

/**
 * Enter marks for one exam paper — one field per student, bulk save.
 */
export default function ExamMarksScreen() {
  const { examId, examSubjectId, name, paper } = useLocalSearchParams<{
    examId: string
    examSubjectId: string
    name?: string
    paper?: string
  }>()
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const { data, isLoading, error, refetch, isRefetching } = useMarksRoster(
    examId ?? '',
    examSubjectId ?? '',
  )
  const save = useSaveMarks(examId ?? '', examSubjectId ?? '')

  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})
  const [filter, setFilter] = React.useState('')
  const seeded = React.useRef(false)

  React.useEffect(() => {
    seeded.current = false
  }, [examSubjectId])

  React.useEffect(() => {
    if (!data || seeded.current) return
    const next: Record<string, Draft> = {}
    for (const row of data.rows) {
      next[row.studentId] = {
        marksObtained:
          row.mark?.isAbsent ? '' : row.mark?.marksObtained != null ? String(row.mark.marksObtained) : '',
        isAbsent: row.mark?.isAbsent ?? false,
      }
    }
    setDrafts(next)
    seeded.current = true
  }, [data])

  const rows = React.useMemo(() => {
    const list = data?.rows ?? []
    const q = filter.trim().toLowerCase()
    if (!q) return list
    return list.filter((row) => {
      const n = fullName(row.student.firstName, row.student.lastName).toLowerCase()
      return n.includes(q) || row.student.admissionNo.toLowerCase().includes(q)
    })
  }, [data?.rows, filter])

  const entered = Object.values(drafts).filter((d) => d.isAbsent || d.marksObtained.trim() !== '').length
  const total = data?.rows.length ?? 0

  function setMark(studentId: string, marksObtained: string) {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: { marksObtained, isAbsent: false },
    }))
  }

  function toggleAbsent(studentId: string) {
    setDrafts((prev) => {
      const cur = prev[studentId] ?? { marksObtained: '', isAbsent: false }
      return {
        ...prev,
        [studentId]: { marksObtained: '', isAbsent: !cur.isAbsent },
      }
    })
  }

  async function onSave() {
    if (!data) return
    const payload = data.rows.map((row) => {
      const d = drafts[row.studentId] ?? { marksObtained: '', isAbsent: false }
      if (d.isAbsent) {
        return { studentId: row.studentId, marksObtained: null, isAbsent: true }
      }
      const raw = d.marksObtained.trim()
      if (raw === '') {
        return { studentId: row.studentId, marksObtained: null, isAbsent: false }
      }
      return {
        studentId: row.studentId,
        marksObtained: Number(raw),
        isAbsent: false,
      }
    })

    // Only rows with a mark or absent — blank cells are left unchanged server-side.
    const toSave = payload.filter((row) => row.isAbsent || row.marksObtained !== null)
    if (toSave.length === 0) {
      Alert.alert('Nothing to save', 'Enter at least one mark or mark a student absent.')
      return
    }

    const invalid = toSave.find(
      (row) =>
        !row.isAbsent &&
        (row.marksObtained === null ||
          !Number.isFinite(row.marksObtained) ||
          row.marksObtained < 0 ||
          row.marksObtained > data.maxMarks),
    )
    if (invalid) {
      Alert.alert('Check marks', `Marks must be between 0 and ${data.maxMarks}.`)
      return
    }

    try {
      await save.mutateAsync(toSave)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert('Marks saved', `${toSave.length} student${toSave.length === 1 ? '' : 's'} updated.`)
      seeded.current = false
      await refetch()
    } catch (err) {
      Alert.alert(
        'Could not save',
        err instanceof ApiError ? err.message : 'Please try again.',
      )
    }
  }

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}
        >
          <Ionicons name="chevron-back" size={20} color={brand} />
          <Txt variant="smallStrong" color={brand}>{name || 'Exam'}</Txt>
        </Pressable>
        <Txt variant="h2" style={{ marginTop: spacing.sm }} numberOfLines={1}>
          {paper || data?.subject.name || 'Marks'}
        </Txt>
        <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 4 }}>
          {data
            ? `Out of ${data.maxMarks} · pass ${data.passMarks} · ${entered}/${total} entered`
            : 'Loading roster…'}
        </Txt>
        <Input
          value={filter}
          onChangeText={setFilter}
          placeholder="Filter by name or admission no."
          style={{ marginTop: spacing.md, marginBottom: spacing.sm }}
        />
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList rows={8} /></View>
      ) : error ? (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load roster.'}
          onRetry={refetch}
        />
      ) : (
        <>
          <FlatList
            data={rows}
            keyExtractor={(r) => r.studentId}
            refreshing={isRefetching}
            onRefresh={refetch}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 100 }}
            renderItem={({ item }) => {
              const draft = drafts[item.studentId] ?? { marksObtained: '', isAbsent: false }
              const nameLabel = fullName(item.student.firstName, item.student.lastName)
              return (
                <View
                  style={{
                    paddingHorizontal: spacing.base,
                    paddingVertical: spacing.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    minHeight: layout.tapTarget + 8,
                    gap: spacing.sm,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong" numberOfLines={1}>{nameLabel}</Txt>
                    <Txt variant="caption" color={colors.textSubtle}>
                      {[item.rollNumber != null ? `Roll ${item.rollNumber}` : null, item.student.admissionNo]
                        .filter(Boolean)
                        .join(' · ')}
                    </Txt>
                  </View>
                  {draft.isAbsent ? (
                    <Badge label="Absent" tone="danger" />
                  ) : (
                    <Input
                      value={draft.marksObtained}
                      onChangeText={(t) => setMark(item.studentId, t.replace(/[^\d.]/g, ''))}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      style={{ width: 72, textAlign: 'center', marginBottom: 0 }}
                    />
                  )}
                  <Pressable
                    onPress={() => toggleAbsent(item.studentId)}
                    accessibilityLabel={draft.isAbsent ? 'Clear absent' : 'Mark absent'}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: radius.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: draft.isAbsent ? colors.danger : colors.surfaceSunken,
                    }}
                  >
                    <Txt variant="caption" color={draft.isAbsent ? '#fff' : colors.textMuted}>Ab</Txt>
                  </Pressable>
                </View>
              )
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: spacing.base,
              right: spacing.base,
              bottom: spacing.base,
            }}
          >
            <Button
              label={`Save marks (${entered})`}
              onPress={() => void onSave()}
              loading={save.isPending}
              disabled={entered === 0}
            />
          </View>
        </>
      )}
    </Screen>
  )
}
