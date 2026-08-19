import React from 'react'
import { Linking, Pressable, ScrollView, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useStudent } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { Avatar, Badge, Button, Card, ErrorState, Screen, SkeletonList, Txt } from '@/components/ui'
import { longDate, money } from '@/lib/format'
import { colors, spacing } from '@/theme'

/**
 * One student.
 *
 * The web puts this in tabs across a wide page. Here it is one column of
 * labelled sections, because a phone scrolls better than it switches tabs, and
 * the guardian's phone number — the reason an office opens this record at all
 * — is a tap away at the top rather than three sections down.
 */
export default function StudentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, isLoading, error, refetch } = useStudent(id ?? '')

  if (isLoading) return <Screen><SkeletonList rows={6} /></Screen>
  if (error || !data) {
    return (
      <Screen>
        <ErrorState message={error instanceof ApiError ? error.message : 'Could not load this student.'} onRetry={refetch} />
      </Screen>
    )
  }

  const name = `${data.firstName} ${data.lastName}`.trim()
  const klass = [data.className, data.sectionName].filter(Boolean).join(' ')

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.brand} />
            <Txt variant="smallStrong" color={colors.brand}>Back</Txt>
          </Pressable>
        </View>

        <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <Avatar name={name} size={72} />
          <Txt variant="h1" style={{ marginTop: spacing.md, textAlign: 'center' }} numberOfLines={2}>{name}</Txt>
          <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 4 }}>
            {[data.admissionNo, klass].filter(Boolean).join(' · ')}
          </Txt>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <Badge label={data.status.toLowerCase()} tone={data.status === 'ACTIVE' ? 'success' : 'neutral'} />
            {data.dueMinor > 0 ? <Badge label={`${money(data.dueMinor)} due`} tone="danger" /> : null}
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.base }}>
          {data.guardianPhone ? (
            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.base }}>
              <Button
                label="Call guardian"
                onPress={() => Linking.openURL(`tel:${data.guardianPhone}`)}
                style={{ flex: 1 }}
              />
              <Button
                label="WhatsApp"
                variant="secondary"
                onPress={() =>
                  Linking.openURL(`https://wa.me/${(data.guardianPhone ?? '').replace(/[^\d]/g, '')}`)
                }
                style={{ flex: 1 }}
              />
            </View>
          ) : null}

          <Section title="Guardian">
            <Row label="Name" value={data.guardianName} />
            <Row label="Phone" value={data.guardianPhone} />
          </Section>

          <Section title="Student">
            <Row label="Admission no." value={data.admissionNo} />
            <Row label="Class" value={klass} />
            <Row label="Roll number" value={data.rollNumber != null ? String(data.rollNumber) : null} />
            <Row label="Gender" value={data.gender ? data.gender.toLowerCase() : null} />
            <Row label="Date of birth" value={data.dateOfBirth ? longDate(data.dateOfBirth) : null} />
            <Row label="Blood group" value={data.bloodGroup} />
            <Row label="Category" value={data.category} />
            <Row label="Admitted" value={data.admissionDate ? longDate(data.admissionDate) : null} />
          </Section>

          <Section title="Fees">
            <Row label="Outstanding" value={money(data.dueMinor)} />
          </Section>
        </View>
      </ScrollView>
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Txt variant="smallStrong" color={colors.textSubtle} style={{ marginBottom: spacing.sm, marginTop: spacing.sm }}>
        {title.toUpperCase()}
      </Txt>
      <Card>{children}</Card>
    </>
  )
}

/** A field with nothing in it is omitted rather than shown as an empty dash. */
function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <View style={{ flexDirection: 'row', paddingVertical: spacing.sm, alignItems: 'flex-start' }}>
      <Txt variant="small" color={colors.textSubtle} style={{ width: 118 }}>{label}</Txt>
      <Txt variant="small" style={{ flex: 1, textTransform: 'none' }}>{value}</Txt>
    </View>
  )
}
