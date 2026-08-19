import React from 'react'
import { Alert, FlatList, View } from 'react-native'
import { useDecideLeave, useLeave } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { Badge, Button, Card, EmptyState, ErrorState, Screen, SkeletonList, Springy, Txt } from '@/components/ui'
import { ScreenHeader } from '@/components/header'
import { friendlyDate, longDate } from '@/lib/format'
import { colors, spacing } from '@/theme'
import type { LeaveRequest, LeaveStatus } from '@/api/types'

/**
 * Leave requests, and deciding them.
 *
 * This is the module that most justifies a phone. Approving leave is a
 * thirty-second decision that blocks somebody else's day, and it happens while
 * the approver is walking between classrooms rather than sitting at a desk.
 * So the two buttons are on the card, not behind a detail screen.
 *
 * Who may decide is the server's answer, not ours: `canDecide` comes back per
 * request and already accounts for self-approval, which the service refuses.
 */
const TABS: { key: LeaveStatus | 'ALL'; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'All' },
]

export default function LeaveScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const [tab, setTab] = React.useState<LeaveStatus | 'ALL'>('PENDING')
  const { data, isLoading, isRefetching, refetch, error } = useLeave(tab === 'ALL' ? undefined : tab)
  const decide = useDecideLeave()

  const pending = (data ?? []).filter((r) => r.status === 'PENDING').length

  function act(request: LeaveRequest, status: 'APPROVED' | 'REJECTED') {
    const verb = status === 'APPROVED' ? 'Approve' : 'Reject'
    Alert.alert(
      `${verb} this request?`,
      `${request.applicantName} · ${request.days} day${request.days === 1 ? '' : 's'} from ${longDate(request.fromDate)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: verb,
          style: status === 'REJECTED' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await decide.mutateAsync({ id: request.id, status })
            } catch (err) {
              Alert.alert(
                `Could not ${verb.toLowerCase()}`,
                err instanceof ApiError ? err.message : 'Please try again.',
              )
            }
          },
        },
      ],
    )
  }

  return (
    <Screen
      padded={false}
      header={
        <ScreenHeader
          title="Leave"
          subtitle={tab === 'PENDING' && pending > 0 ? `${pending} awaiting a decision` : 'Requests and decisions'}
          tint={brand}
        />
      }
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <Springy key={t.key} onPress={() => setTab(t.key)} accessibilityLabel={t.label} style={{ flex: 1 }}>
              <View
                style={{
                  minHeight: 38,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? brand : colors.surface,
                  borderWidth: 1,
                  borderColor: active ? brand : colors.border,
                }}
              >
                <Txt variant="caption" color={active ? '#FFFFFF' : colors.textMuted}>{t.label}</Txt>
              </View>
            </Springy>
          )
        })}
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList rows={5} /></View>
      ) : error ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Could not load leave.'} onRetry={refetch} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.id}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={
            (data?.length ?? 0) === 0 ? { flexGrow: 1 } : { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl }
          }
          ListEmptyComponent={
            <EmptyState
              title={tab === 'PENDING' ? 'Nothing to decide' : 'No requests'}
              body={tab === 'PENDING' ? 'Every request has been dealt with.' : 'Leave requests appear here.'}
            />
          }
          renderItem={({ item }) => (
            <LeaveCard request={item} busy={decide.isPending} onDecide={(status) => act(item, status)} />
          )}
        />
      )}
    </Screen>
  )
}

const TONE: Record<LeaveStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
}

function LeaveCard({
  request,
  busy,
  onDecide,
}: {
  request: LeaveRequest
  busy: boolean
  onDecide: (status: 'APPROVED' | 'REJECTED') => void
}) {
  const sameDay = request.fromDate.slice(0, 10) === request.toDate.slice(0, 10)

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingRight: spacing.sm }}>
          <Txt variant="bodyStrong" numberOfLines={1}>{request.applicantName}</Txt>
          <Txt variant="small" color={colors.textSubtle} numberOfLines={1} style={{ marginTop: 2 }}>
            {[request.applicantDetail, request.applicantType === 'STUDENT' ? 'Student' : 'Staff'].filter(Boolean).join(' · ')}
          </Txt>
        </View>
        <Badge label={request.status.toLowerCase()} tone={TONE[request.status]} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm }}>
        <Badge label={`${request.days} day${request.days === 1 ? '' : 's'}`} tone="info" />
        <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }} numberOfLines={1}>
          {sameDay ? longDate(request.fromDate) : `${longDate(request.fromDate)} – ${longDate(request.toDate)}`}
        </Txt>
      </View>

      {request.leaveType ? (
        <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.sm }}>{request.leaveType}</Txt>
      ) : null}

      <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>{request.reason}</Txt>

      {request.status === 'PENDING' && request.canDecide ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.base }}>
          <Button label="Reject" variant="secondary" onPress={() => onDecide('REJECTED')} disabled={busy} style={{ flex: 1 }} />
          <Button label="Approve" onPress={() => onDecide('APPROVED')} disabled={busy} style={{ flex: 1 }} />
        </View>
      ) : request.status === 'PENDING' ? (
        <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.md }}>
          Somebody else has to decide this one.
        </Txt>
      ) : request.decidedAt ? (
        <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.md }}>
          Decided {friendlyDate(request.decidedAt)}
          {request.decisionNote ? ` — ${request.decisionNote}` : ''}
        </Txt>
      ) : null}
    </Card>
  )
}
