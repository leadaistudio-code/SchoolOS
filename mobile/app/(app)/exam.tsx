import React from 'react'
import { Pressable, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useExamMarksSetup } from '@/api/hooks'
import { ApiError } from '@/api/client'
import {
  Card,
  EmptyState,
  ErrorState,
  ListRow,
  Screen,
  SkeletonList,
  Txt,
} from '@/components/ui'
import { useAuth } from '@/auth/store'
import { colors, spacing } from '@/theme'

/**
 * One exam on the phone: attendance desk and/or marks entry by paper.
 */
export default function ExamHubScreen() {
  const { examId, name } = useLocalSearchParams<{ examId: string; name?: string }>()
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const can = useAuth((s) => s.can)
  const canAttend = can('exams.attendance')
  const canMarks = can('exams.marks')

  const setup = useExamMarksSetup(canMarks ? (examId ?? '') : '')

  return (
    <Screen padded={false} scroll>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}
        >
          <Ionicons name="chevron-back" size={20} color={brand} />
          <Txt variant="smallStrong" color={brand}>Exams</Txt>
        </Pressable>

        <Txt variant="h2" style={{ marginTop: spacing.sm }} numberOfLines={2}>
          {name || setup.data?.name || 'Exam'}
        </Txt>

        {canAttend ? (
          <Card
            style={{ marginTop: spacing.lg }}
            onPress={() =>
              router.push({
                pathname: '/(app)/exam-attendance',
                params: { examId: examId!, name: name || setup.data?.name },
              })
            }
            accessibilityLabel="Exam attendance"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.surfaceSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: spacing.md,
                }}
              >
                <Ionicons name="qr-code-outline" size={20} color={brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">Attendance desk</Txt>
                <Txt variant="caption" color={colors.textSubtle}>
                  Scan admit cards or mark present / absent
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </View>
          </Card>
        ) : null}

        {canMarks ? (
          <View style={{ marginTop: spacing.xl }}>
            <Txt variant="smallStrong" color={colors.textSubtle} style={{ marginBottom: spacing.sm }}>
              ENTER MARKS
            </Txt>
            {setup.isLoading ? (
              <SkeletonList rows={4} />
            ) : setup.error ? (
              <ErrorState
                message={setup.error instanceof ApiError ? setup.error.message : 'Could not load papers.'}
                onRetry={setup.refetch}
              />
            ) : (setup.data?.subjects.length ?? 0) === 0 ? (
              <EmptyState
                title="No papers to mark"
                body="Papers you teach appear here once they are set up for this exam."
              />
            ) : (
              setup.data!.subjects.map((paper) => (
                <ListRow
                  key={paper.id}
                  title={paper.classSubject.subject.name}
                  subtitle={`${paper.classSubject.classLevel.name} · out of ${paper.maxMarks}`}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/exam-marks',
                      params: {
                        examId: examId!,
                        examSubjectId: paper.id,
                        name: name || setup.data?.name,
                        paper: paper.classSubject.subject.name,
                      },
                    })
                  }
                />
              ))
            )}
          </View>
        ) : null}

        {!canAttend && !canMarks ? (
          <EmptyState
            title="View only"
            body="You can see this exam on the list, but marks and attendance need extra permission."
          />
        ) : null}
      </View>
    </Screen>
  )
}
