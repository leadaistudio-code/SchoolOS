import React from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useEvaluationJobs } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { Badge, Card, EmptyState, ErrorState, Screen, SkeletonList, Txt } from '@/components/ui'
import { ScreenHeader } from '@/components/header'
import { colors, spacing } from '@/theme'
import type { EvaluationJobRow } from '@/api/types'

/**
 * AI evaluation queue — open a review desk for each uploaded sheet.
 */
export default function EvaluationQueueScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const canEvaluate = useAuth((s) => s.can('assessments.evaluate'))
  const { data, isLoading, isRefetching, refetch, error } = useEvaluationJobs(canEvaluate)

  const jobs = data ?? []
  const reviewCount = jobs.filter((j) => j.status === 'REVIEW_REQUIRED').length

  return (
    <Screen
      padded={false}
      header={
        <ScreenHeader
          title="AI Evaluation"
          subtitle={
            reviewCount > 0
              ? `${reviewCount} sheet${reviewCount === 1 ? '' : 's'} need review`
              : 'Answer-sheet review queue'
          }
          tint={brand}
        />
      }
    >
      {!canEvaluate ? (
        <EmptyState
          title="No access"
          body="You need permission to evaluate assessments."
        />
      ) : isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}>
          <SkeletonList rows={6} />
        </View>
      ) : error ? (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load the queue.'}
          onRetry={() => refetch()}
        />
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          refreshing={isRefetching}
          onRefresh={() => refetch()}
          contentContainerStyle={
            jobs.length === 0
              ? { flexGrow: 1 }
              : { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl, gap: spacing.sm }
          }
          ListEmptyComponent={
            <EmptyState
              title="Nothing in the queue"
              body="Upload sheets from the web evaluation desk. Jobs that need review show up here."
            />
          }
          renderItem={({ item }) => <JobCard item={item} brand={brand} />}
        />
      )}
    </Screen>
  )
}

function JobCard({ item, brand }: { item: EvaluationJobRow; brand: string }) {
  const student = item.answerSheet.student
  const name = `${student.firstName} ${student.lastName}`.trim()
  const needsReview = item.status === 'REVIEW_REQUIRED'
  const tone =
    needsReview ? 'warning' : item.status === 'FAILED' ? 'danger' : item.status === 'COMPLETED' ? 'success' : 'neutral'

  return (
    <Card
      onPress={() => router.push({ pathname: '/(app)/evaluation-review', params: { jobId: item.id } })}
      accessibilityLabel={`Review ${name}`}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Txt variant="bodyStrong" style={{ flex: 1 }}>
          {name}
        </Txt>
        <Badge label={item.status.replaceAll('_', ' ')} tone={tone} />
      </View>
      <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
        {item.answerSheet.assignment.assessment.title}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm }}>
        <Ionicons name="document-outline" size={14} color={brand} />
        <Txt variant="small" color={colors.textSubtle}>
          {item._count.answers} answers · {item.answerSheet.pageCount} page
          {item.answerSheet.pageCount === 1 ? '' : 's'}
        </Txt>
      </View>
    </Card>
  )
}
