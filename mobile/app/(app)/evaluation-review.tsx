import React from 'react'
import { Alert, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useEvaluationJob, useReviewEvaluatedAnswer } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Screen,
  SkeletonList,
  Txt,
} from '@/components/ui'
import { ScreenHeader } from '@/components/header'
import { colors, spacing } from '@/theme'

/**
 * Mobile review desk — Approve / Change marks / Flag one answer at a time.
 */
export default function EvaluationReviewScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const { jobId } = useLocalSearchParams<{ jobId: string }>()
  const { data, isLoading, isRefetching, refetch, error } = useEvaluationJob(jobId ?? '')
  const review = useReviewEvaluatedAnswer(jobId ?? '')

  const [index, setIndex] = React.useState(0)
  const [marks, setMarks] = React.useState('')
  const [feedback, setFeedback] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const answers = data?.answers ?? []
  const current = answers[index] ?? null

  React.useEffect(() => {
    if (!current) return
    setMarks(
      current.teacherMarks != null
        ? String(current.teacherMarks)
        : current.suggestedMarks != null
          ? String(current.suggestedMarks)
          : '',
    )
    setFeedback(current.teacherFeedback ?? current.feedback ?? '')
  }, [current?.id])

  async function submit(status: 'APPROVED' | 'OVERRIDDEN' | 'FLAGGED') {
    if (!current) return
    setBusy(true)
    try {
      const parsed = marks.trim() === '' ? undefined : Number(marks)
      if (status === 'OVERRIDDEN' && (parsed == null || Number.isNaN(parsed))) {
        Alert.alert('Marks required', 'Enter marks when changing the AI suggestion.')
        return
      }
      await review.mutateAsync({
        answerId: current.id,
        reviewStatus: status,
        teacherMarks: status === 'FLAGGED' ? undefined : parsed,
        teacherFeedback: feedback.trim() || undefined,
      })
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      if (index < answers.length - 1) setIndex((i) => i + 1)
      else {
        Alert.alert('Done', 'All answers reviewed. Finalise the attempt on the web when ready.')
        router.back()
      }
    } catch (err) {
      Alert.alert('Review failed', err instanceof ApiError ? err.message : 'Could not save review')
    } finally {
      setBusy(false)
    }
  }

  const student = data?.answerSheet.student
  const subtitle = student
    ? `${student.firstName} ${student.lastName}`.trim()
    : 'Answer sheet'

  return (
    <Screen
      scroll
      refreshing={isRefetching}
      onRefresh={() => refetch()}
      header={
        <ScreenHeader
          title="Review sheet"
          subtitle={
            answers.length > 0
              ? `${subtitle} · Q${index + 1} of ${answers.length}`
              : subtitle
          }
          tint={brand}
          onBack={() => router.back()}
        />
      }
    >
      {isLoading && !data ? (
        <SkeletonList rows={5} />
      ) : error ? (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load this job.'}
          onRetry={() => refetch()}
        />
      ) : !data || answers.length === 0 ? (
        <EmptyState
          title="No answers yet"
          body="Wait for OCR to finish, then pull to refresh."
        />
      ) : current ? (
        <View style={{ gap: spacing.md, paddingBottom: spacing.xxl }}>
          <Badge
            label={
              current.needsReview
                ? `${current.reviewStatus} · needs review`
                : current.reviewStatus
            }
            tone={current.needsReview ? 'warning' : 'neutral'}
          />

          <View>
            <Txt variant="smallStrong" color={colors.textMuted}>
              Extracted answer
            </Txt>
            <Txt variant="body" style={{ marginTop: spacing.xs }}>
              {current.extractedText?.trim() || '— (blank or not read)'}
            </Txt>
          </View>

          <View>
            <Txt variant="smallStrong" color={colors.textMuted}>
              AI suggestion
            </Txt>
            <Txt variant="body" style={{ marginTop: spacing.xs }}>
              {current.suggestedMarks ?? '—'} / {current.maxMarks ?? '—'} marks
              {current.ocrConfidence != null ? ` · OCR ${Math.round(current.ocrConfidence)}%` : ''}
              {current.evaluationConfidence != null
                ? ` · Eval ${Math.round(current.evaluationConfidence)}%`
                : ''}
            </Txt>
            {current.feedback ? (
              <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
                {current.feedback}
              </Txt>
            ) : null}
          </View>

          <Field label="Marks">
            <Input
              value={marks}
              onChangeText={setMarks}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </Field>
          <Field label="Feedback (optional)">
            <Input
              value={feedback}
              onChangeText={setFeedback}
              multiline
              placeholder="Note for the student"
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
          </Field>

          <Button label="Approve" disabled={busy} onPress={() => submit('APPROVED')} />
          <Button
            label="Change marks"
            variant="secondary"
            disabled={busy}
            onPress={() => submit('OVERRIDDEN')}
          />
          <Button
            label="Flag for later"
            variant="ghost"
            disabled={busy}
            onPress={() => submit('FLAGGED')}
          />

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label="Previous"
              variant="secondary"
              disabled={busy || index === 0}
              onPress={() => setIndex((i) => Math.max(0, i - 1))}
              style={{ flex: 1 }}
            />
            <Button
              label="Next"
              variant="secondary"
              disabled={busy || index >= answers.length - 1}
              onPress={() => setIndex((i) => Math.min(answers.length - 1, i + 1))}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  )
}
