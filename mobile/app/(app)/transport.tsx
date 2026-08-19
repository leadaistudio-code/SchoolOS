import React from 'react'
import { FlatList, View } from 'react-native'
import { useTransportRoutes } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { Badge, Card, EmptyState, ErrorState, IconTile, Screen, SkeletonList, Springy, Txt } from '@/components/ui'
import { ScreenHeader } from '@/components/header'
import { CallRow } from '@/components/contact'
import { colors, radius, spacing } from '@/theme'
import type { TransportRoute } from '@/api/types'

/**
 * Routes, their buses, and the stops on them.
 *
 * A route is a sequence, so the stops are drawn as one — a line with a dot per
 * stop and the pickup time beside it. A table of stop names and times is the
 * same information and reads as a spreadsheet; the line reads as a journey,
 * which is what somebody asking "when does the bus reach us" is picturing.
 *
 * The driver's number is a call button: when a bus is late, the office rings
 * the driver, and that is the entire reason this screen exists on a phone.
 */
export default function TransportScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const { data, isLoading, isRefetching, refetch, error } = useTransportRoutes()
  const [open, setOpen] = React.useState<string | null>(null)

  const active = (data ?? []).filter((r) => r.isActive).length

  return (
    <Screen
      padded={false}
      header={
        <ScreenHeader
          title="Transport"
          subtitle={data ? `${active} route${active === 1 ? '' : 's'} running` : 'Routes, buses and stops'}
          tint={brand}
        />
      }
    >
      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList rows={5} /></View>
      ) : error ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Could not load transport.'} onRetry={refetch} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.id}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={
            (data?.length ?? 0) === 0 ? { flexGrow: 1 } : { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl }
          }
          ListEmptyComponent={<EmptyState title="No routes" body="Routes set up on the web appear here." />}
          renderItem={({ item }) => (
            <RouteCard route={item} expanded={open === item.id} onToggle={() => setOpen(open === item.id ? null : item.id)} />
          )}
        />
      )}
    </Screen>
  )
}

function RouteCard({ route, expanded, onToggle }: { route: TransportRoute; expanded: boolean; onToggle: () => void }) {
  const driver = route.bus?.driver
  const driverName = driver ? `${driver.firstName} ${driver.lastName}`.trim() : null

  return (
    <Springy onPress={onToggle} accessibilityLabel={route.name}>
      <Card style={!route.isActive ? { opacity: 0.6 } : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconTile icon="bus-outline" tint={colors.transport} size={40} soft />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Txt variant="bodyStrong" numberOfLines={1}>{route.name}</Txt>
            <Txt variant="small" color={colors.textSubtle} numberOfLines={1} style={{ marginTop: 2 }}>
              {[route.bus?.code, route.bus?.registrationNo, `${route.stops.length} stops`]
                .filter(Boolean)
                .join(' · ')}
            </Txt>
          </View>
          {!route.isActive ? <Badge label="Off" tone="neutral" /> : route.distanceKm ? (
            <Badge label={`${route.distanceKm} km`} tone="info" />
          ) : null}
        </View>

        {expanded ? (
          <View style={{ marginTop: spacing.base, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
            {route.bus ? (
              <View style={{ marginBottom: spacing.md }}>
                <Txt variant="smallStrong" color={colors.textMuted}>
                  {route.bus.code}
                  {route.bus.capacity ? ` · ${route.bus.capacity} seats` : ''}
                </Txt>
                {driverName ? (
                  <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 2 }}>
                    Driver: {driverName}
                  </Txt>
                ) : null}
              </View>
            ) : (
              <Txt variant="small" color={colors.warning} style={{ marginBottom: spacing.md }}>
                No bus assigned to this route.
              </Txt>
            )}

            {driver?.phone ? (
              <View style={{ marginBottom: spacing.base }}>
                <CallRow phone={driver.phone} />
              </View>
            ) : null}

            {/* The stops, as a line. */}
            {route.stops.map((stop, i) => {
              const last = i === route.stops.length - 1
              return (
                <View key={stop.id} style={{ flexDirection: 'row' }}>
                  <View style={{ width: 20, alignItems: 'center' }}>
                    <View
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 5,
                        backgroundColor: colors.transport,
                        marginTop: 5,
                      }}
                    />
                    {!last ? (
                      <View style={{ flex: 1, width: 2, backgroundColor: `${colors.transport}44`, marginVertical: 2 }} />
                    ) : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: last ? 0 : spacing.md, paddingLeft: spacing.sm }}>
                    <Txt variant="small" numberOfLines={1}>{stop.name}</Txt>
                    {stop.pickupTime || stop.dropTime ? (
                      <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: 1 }}>
                        {[stop.pickupTime ? `Pick-up ${stop.pickupTime}` : null, stop.dropTime ? `Drop ${stop.dropTime}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Txt>
                    ) : null}
                  </View>
                </View>
              )
            })}

            {route.stops.length === 0 ? (
              <Txt variant="small" color={colors.textSubtle}>No stops on this route yet.</Txt>
            ) : null}
          </View>
        ) : null}
      </Card>
    </Springy>
  )
}
