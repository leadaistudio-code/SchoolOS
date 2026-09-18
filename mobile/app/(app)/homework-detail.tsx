import React from 'react'
import { Alert, FlatList, Pressable, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  useHomeworkDetail,
  useReviewSubmission,
  useUpdateHomework,
} from '@/api/hooks'
import { ApiError } from '@/api/client'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Screen,
  SkeletonList,
  Txt,
} from '@/components/ui'
import { useAuth } from '@/auth/store'
import { fullName, longDate } from '@/lib/format'
import { colors, spacing } from '@/theme'
import type { HomeworkSubmission } from '@/api/types'

/**
 * One homework: publish if draft, review submissions.
 */
export default function HomeworkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const canReview = useAuth((s) => s.can('homework.review'))
  const canEdit = useAuth((s) => s.can('homework.edit'))
  const { data, isLoading, isRefetching, refetch, error } = useHomeworkDetail(id ?? '')
  const publish = useUpdateHomework(id ?? '')
  const review = useReviewSubmission()

  function mark(sub: HomeworkSubmission, status: 'REVIEWED' | 'REDO') {
    const name = fullName(sub.student.firstName, sub.student.lastName)
    Alert.alert(
      status === 'REVIEWED' ? 'Mark as reviewed?' : 'Ask to redo?',
      name,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'REVIEWED' ? 'Reviewed' : 'Redo',
          style: status === 'REDO' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await review.mutateAsync({ submissionId: sub.id, status })
              await refetch()
            } catch (err) {
              Alert.alert('Failed', err instanceof ApiError ? err.message : 'Try again')
            }
          },
        },
      ],
    )
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
          message={error instanceof ApiError ? error.message : 'Could not load homework.'}
          onRetry={refetch}
        />
      </Screen>
    )
  }

  const hw = data.homework
  const klass = [hw.classLevel.name, hw.section?.name].filter(Boolean).join(' ')

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}
        >
          <Ionicons name="chevron-back" size={20} color={brand} />
          <Txt variant="smallStrong" color={brand}>Homework</Txt>
        </Pressable>
        <Txt variant="h2" style={{ marginTop: spacing.sm }} numberOfLines={2}>{hw.title}</Txt>
        <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 4 }}>
          {[hw.classSubject.subject.name, klass].filter(Boolean).join(' · ')} · due {longDate(hw.dueOn)}
        </Txt>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <Badge label={hw.isPublished ? 'Published' : 'Draft'} tone={hw.isPublished ? 'success' : 'neutral'} />
        </View>

        {!hw.isPublished && canEdit ? (
          <Button
            label="Publish now"
            loading={publish.isPending}
            onPress={async () => {
              try {
                await publish.mutateAsync({ isPublished: true })
                await refetch()
              } catch (err) {
                Alert.alert('Could not publish', err instanceof ApiError ? err.message : 'Try again')
              }
            }}
            style={{ marginTop: spacing.md }}
          />
        ) : null}

        {hw.instructions ? (
          <Card style={{ marginTop: spacing.md }}>
            <Txt variant="small">{hw.instructions}</Txt>
          </Card>
        ) : null}

        <Txt variant="smallStrong" color={colors.textSubtle} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          SUBMISSIONS ({data.submissions.length})
        </Txt>
      </View>

      <FlatList
        data={data.submissions}
        keyExtractor={(s) => s.id}
        refreshing={isRefetching}
        onRefresh={refetch}
        contentContainerStyle={{ paddingHorizontal: spacing.base, paddingBottom: spacing.xxl }}
        ListEmptyComponent={
          <EmptyState title="No submissions yet" body={`${data.pending.length} student(s) still to hand in.`} />
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{fullName(item.student.firstName, item.student.lastName)}</Txt>
                <Txt variant="caption" color={colors.textSubtle}>{item.student.admissionNo}</Txt>
                {item.note ? (
                  <Txt variant="small" color={colors.textMuted} style={{ marginTop: 4 }}>{item.note}</Txt>
                ) : null}
              </View>
              <Badge
                label={item.status.toLowerCase()}
                tone={
                  item.status === 'REVIEWED' ? 'success'
                  : item.status === 'REDO' ? 'warning'
                  : 'info'
                }
              />
            </View>
            {item.score != null ? (
              <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.sm }}>
                Score {item.score}{hw.maxScore != null ? ` / ${hw.maxScore}` : ''}
              </Txt>
            ) : null}
            {canReview && item.status !== 'REVIEWED' ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <Button
                  label="Reviewed"
                  onPress={() => mark(item, 'REVIEWED')}
                  loading={review.isPending}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Redo"
                  variant="secondary"
                  onPress={() => mark(item, 'REDO')}
                  disabled={review.isPending}
                  style={{ flex: 1 }}
                />
              </View>
            ) : null}
            {canReview && item.status === 'REVIEWED' && hw.maxScore != null ? (
              <ScoreEditor
                maxScore={hw.maxScore}
                current={item.score}
                onSave={async (score) => {
                  await review.mutateAsync({
                    submissionId: item.id,
                    status: 'REVIEWED',
                    score,
                  })
                  await refetch()
                }}
              />
            ) : null}
          </Card>
        )}
      />
    </Screen>
  )
}

function ScoreEditor({
  maxScore,
  current,
  onSave,
}: {
  maxScore: number
  current: number | null
  onSave: (score: number) => Promise<void>
}) {
  const [value, setValue] = React.useState(current != null ? String(current) : '')
  const [busy, setBusy] = React.useState(false)
  return (
    <View style={{ marginTop: spacing.md, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
      <Input
        value={value}
        onChangeText={setValue}
        keyboardType="number-pad"
        placeholder={`/${maxScore}`}
        style={{ flex: 1 }}
      />
      <Button
        label="Save score"
        loading={busy}
        onPress={async () => {
          const n = Number(value)
          if (!Number.isFinite(n) || n < 0 || n > maxScore) {
            Alert.alert('Invalid score', `Enter a number between 0 and ${maxScore}.`)
            return
          }
          setBusy(true)
          try {
            await onSave(n)
          } catch (err) {
            Alert.alert('Failed', err instanceof ApiError ? err.message : 'Try again')
          } finally {
            setBusy(false)
          }
        }}
      />
    </View>
  )
}
