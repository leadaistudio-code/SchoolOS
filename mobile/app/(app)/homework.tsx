import React from 'react'
import { FlatList, View } from 'react-native'
import { useHomework } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { Badge, Card, EmptyState, ErrorState, Screen, SkeletonList, Springy, Txt } from '@/components/ui'
import { ScreenHeader } from '@/components/header'
import { friendlyDate, longDate } from '@/lib/format'
import { colors, radius, spacing } from '@/theme'
import type { Homework } from '@/api/types'

/**
 * Homework set, and how far the class has got with it.
 *
 * The useful question is not "what was set" — the teacher who set it knows —
 * but "how many have handed it in and how many have I marked". So each card
 * leads with a progress bar of submitted against expected, and the marking
 * backlog is the number in amber.
 */
export default function HomeworkScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const { data, isLoading, isRefetching, refetch, error } = useHomework()
  const [open, setOpen] = React.useState<string | null>(null)

  // Overdue first, then soonest due: what needs chasing is what you opened for.
  const rows = React.useMemo(() => {
    return [...(data ?? [])].sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
      const at = a.dueOn ? new Date(a.dueOn).getTime() : Number.MAX_SAFE_INTEGER
      const bt = b.dueOn ? new Date(b.dueOn).getTime() : Number.MAX_SAFE_INTEGER
      return at - bt
    })
  }, [data])

  const awaiting = rows.reduce((n, h) => n + Math.max(0, h.submitted - h.reviewed), 0)

  return (
    <Screen
      padded={false}
      header={
        <ScreenHeader
          title="Homework"
          subtitle={awaiting > 0 ? `${awaiting} submission${awaiting === 1 ? '' : 's'} to review` : 'Nothing waiting to be marked'}
          tint={brand}
        />
      }
    >
      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList rows={5} /></View>
      ) : error ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Could not load homework.'} onRetry={refetch} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(h) => h.id}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={
            rows.length === 0 ? { flexGrow: 1 } : { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl }
          }
          ListEmptyComponent={<EmptyState title="No homework set" body="Work set on the web appears here." />}
          renderItem={({ item }) => (
            <HomeworkCard item={item} expanded={open === item.id} onToggle={() => setOpen(open === item.id ? null : item.id)} />
          )}
        />
      )}
    </Screen>
  )
}

function HomeworkCard({ item, expanded, onToggle }: { item: Homework; expanded: boolean; onToggle: () => void }) {
  const klass = [item.className, item.sectionName].filter(Boolean).join(' ')
  const done = item.expected > 0 ? item.submitted / item.expected : 0
  const marked = item.submitted > 0 ? item.reviewed / item.submitted : 0
  const toReview = Math.max(0, item.submitted - item.reviewed)

  return (
    <Springy onPress={onToggle} accessibilityLabel={item.title}>
      <Card style={item.isOverdue ? { borderColor: `${colors.overdue}44` } : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: spacing.sm }}>
            <Txt variant="bodyStrong" numberOfLines={2}>{item.title}</Txt>
            <Txt variant="small" color={colors.textSubtle} numberOfLines={1} style={{ marginTop: 2 }}>
              {[item.subject, klass].filter(Boolean).join(' · ')}
            </Txt>
          </View>
          {item.isOverdue ? (
            <Badge label="Overdue" tone="danger" />
          ) : !item.isPublished ? (
            <Badge label="Draft" tone="neutral" />
          ) : toReview > 0 ? (
            <Badge label={`${toReview} to mark`} tone="warning" />
          ) : item.submitted === 0 ? (
            // "Up to date" here would mean "nothing left to mark", which is
            // true and reads as "the class has done it" — the opposite.
            <Badge label="None handed in" tone="neutral" />
          ) : (
            <Badge label="All marked" tone="success" />
          )}
        </View>

        {/* Submitted against expected, with the marked part deeper. One bar
            answers both "have they done it" and "have I marked it". */}
        <View
          accessibilityLabel={`${item.submitted} of ${item.expected} submitted, ${item.reviewed} marked`}
          style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, marginTop: spacing.md, overflow: 'hidden', flexDirection: 'row' }}
        >
          <View style={{ width: `${Math.min(100, done * 100)}%`, backgroundColor: colors.fees, flexDirection: 'row' }}>
            <View style={{ width: `${marked * 100}%`, backgroundColor: colors.attendance }} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
          <Txt variant="caption" color={colors.textSubtle} style={{ flex: 1 }}>
            {item.submitted} of {item.expected} handed in · {item.reviewed} marked
          </Txt>
          {item.dueOn ? (
            <Txt variant="caption" color={item.isOverdue ? colors.overdue : colors.textSubtle}>
              Due {friendlyDate(item.dueOn)}
            </Txt>
          ) : null}
        </View>

        {expanded ? (
          <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
            <Row label="Set by" value={item.teacher} />
            <Row label="Set on" value={longDate(item.assignedOn)} />
            <Row label="Due" value={item.dueOn ? longDate(item.dueOn) : 'No due date'} />
            {item.maxScore != null ? <Row label="Out of" value={`${item.maxScore}`} /> : null}
            {item.attachmentCount > 0 ? <Row label="Attachments" value={`${item.attachmentCount}`} /> : null}
            <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.sm }}>
              Marking a submission is on the web for now.
            </Txt>
          </View>
        ) : null}
      </Card>
    </Springy>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 5 }}>
      <Txt variant="small" color={colors.textSubtle} style={{ width: 110 }}>{label}</Txt>
      <Txt variant="small" style={{ flex: 1 }}>{value}</Txt>
    </View>
  )
}
