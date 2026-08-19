import React from 'react'
import { Linking, Pressable, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { usePipeline } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { Badge, Card, EmptyState, ErrorState, Screen, SkeletonList, Txt } from '@/components/ui'
import { friendlyDate } from '@/lib/format'
import { colors, radius, spacing } from '@/theme'
import type { Enquiry } from '@/api/types'

/**
 * The admissions pipeline.
 *
 * The web shows a kanban board. Horizontal columns are the wrong shape for a
 * phone — you cannot see a column and its neighbour at once, so the comparison
 * a board exists for is lost anyway. Here the stages are stacked, each with
 * its count, and the enquiry's two useful actions (call, WhatsApp) are on the
 * card rather than behind a menu.
 */
const STAGE_ORDER = ['NEW', 'CONTACTED', 'VISITED', 'APPLIED', 'ENROLLED', 'LOST']

const STAGE_TONE: Record<string, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  NEW: 'info',
  CONTACTED: 'warning',
  VISITED: 'warning',
  APPLIED: 'info',
  ENROLLED: 'success',
  LOST: 'danger',
}

export default function AdmissionsScreen() {
  const { data, isLoading, isRefetching, refetch, error } = usePipeline()
  const [open, setOpen] = React.useState<string | null>('NEW')

  const stages = React.useMemo(() => {
    if (!data) return []
    const keys = Object.keys(data)
    keys.sort((a, b) => {
      const ai = STAGE_ORDER.indexOf(a)
      const bi = STAGE_ORDER.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
    return keys.map((key) => ({ key, leads: data[key] ?? [] }))
  }, [data])

  const total = stages.reduce((n, s) => n + s.leads.length, 0)

  if (isLoading) return <Screen><SkeletonList rows={6} /></Screen>
  if (error) {
    return (
      <Screen>
        <ErrorState message={error instanceof ApiError ? error.message : 'Could not load enquiries.'} onRetry={refetch} />
      </Screen>
    )
  }

  return (
    <Screen scroll refreshing={isRefetching} onRefresh={refetch}>
      <Txt variant="h1" style={{ paddingTop: spacing.md }} accessibilityRole="header">Admissions</Txt>
      <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 2, marginBottom: spacing.base }}>
        {total} enquir{total === 1 ? 'y' : 'ies'} in the pipeline
      </Txt>

      {total === 0 ? (
        <EmptyState title="No enquiries yet" body="Enquiries captured on the website or by the front office appear here." />
      ) : (
        stages.map(({ key, leads }) => {
          const expanded = open === key
          return (
            <View key={key} style={{ marginBottom: spacing.md }}>
              <Card onPress={() => setOpen(expanded ? null : key)} accessibilityLabel={`${key}, ${leads.length} enquiries`}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Badge label={key.toLowerCase()} tone={STAGE_TONE[key] ?? 'neutral'} />
                  <Txt variant="bodyStrong" style={{ flex: 1, marginLeft: spacing.md }}>
                    {leads.length}
                  </Txt>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSubtle} />
                </View>
              </Card>

              {expanded
                ? leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
                : null}
            </View>
          )
        })
      )}
    </Screen>
  )
}

function LeadCard({ lead }: { lead: Enquiry }) {
  const digits = (lead.phone ?? '').replace(/[^\d]/g, '')
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.base,
        padding: spacing.base,
        marginBottom: spacing.sm,
        marginLeft: spacing.base,
      }}
    >
      <Txt variant="bodyStrong" numberOfLines={1}>{lead.studentName}</Txt>
      <Txt variant="small" color={colors.textSubtle} numberOfLines={1} style={{ marginTop: 2 }}>
        {[lead.reference, lead.className, lead.parentName].filter(Boolean).join(' · ')}
      </Txt>

      {lead.nextFollowUpOn ? (
        <Txt
          variant="caption"
          color={new Date(lead.nextFollowUpOn) < new Date() ? colors.overdue : colors.textSubtle}
          style={{ marginTop: spacing.sm }}
        >
          Follow up {friendlyDate(lead.nextFollowUpOn)}
        </Txt>
      ) : null}

      {digits ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Action icon="call-outline" label="Call" onPress={() => Linking.openURL(`tel:${lead.phone}`)} />
          <Action icon="logo-whatsapp" label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${digits}`)} />
        </View>
      ) : null}
    </View>
  )
}

function Action({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: 44,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        opacity: pressed ? 0.6 : 1,
      }]}
    >
      <Ionicons name={icon} size={16} color={colors.brand} />
      <Txt variant="smallStrong" color={colors.brand}>{label}</Txt>
    </Pressable>
  )
}
