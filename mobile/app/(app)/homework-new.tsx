import React from 'react'
import { Alert, Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useCreateHomework, useTeachableSubjects } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { Button, Field, Input, Screen, SkeletonList, Springy, Txt } from '@/components/ui'
import { useAuth } from '@/auth/store'
import { apiDate } from '@/lib/format'
import { colors, radius, spacing } from '@/theme'

/**
 * Set homework for a teachable subject / section.
 */
export default function HomeworkNewScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const canCreate = useAuth((s) => s.can('homework.create'))
  const subjects = useTeachableSubjects()
  const create = useCreateHomework()

  const today = apiDate(new Date())
  const [classSubjectId, setClassSubjectId] = React.useState<string | undefined>()
  const [sectionId, setSectionId] = React.useState<string | undefined>()
  const [title, setTitle] = React.useState('')
  const [instructions, setInstructions] = React.useState('')
  const [assignedOn, setAssignedOn] = React.useState(today)
  const [dueOn, setDueOn] = React.useState(today)
  const [maxScore, setMaxScore] = React.useState('')
  const [publish, setPublish] = React.useState(true)

  const selected = (subjects.data ?? []).find((s) => s.id === classSubjectId)

  React.useEffect(() => {
    if (!classSubjectId && subjects.data?.[0]) setClassSubjectId(subjects.data[0].id)
  }, [subjects.data, classSubjectId])

  async function submit() {
    if (!classSubjectId || title.trim().length < 3) {
      Alert.alert('Missing details', 'Choose a subject and give the work a title.')
      return
    }
    try {
      const row = await create.mutateAsync({
        classSubjectId,
        sectionId,
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        assignedOn,
        dueOn,
        maxScore: maxScore ? Number(maxScore) : undefined,
        isPublished: publish,
      })
      Alert.alert(
        publish ? 'Homework published' : 'Draft saved',
        publish ? 'Parents and students have been notified.' : 'Publish it when you are ready.',
        [
          {
            text: 'Open',
            onPress: () =>
              router.replace({ pathname: '/(app)/homework-detail', params: { id: row.id } }),
          },
          { text: 'Done', onPress: () => router.back() },
        ],
      )
    } catch (err) {
      Alert.alert(
        'Could not save',
        err instanceof ApiError ? err.message : 'Please try again.',
      )
    }
  }

  if (!canCreate) {
    return (
      <Screen>
        <Txt variant="body">You do not have permission to set homework.</Txt>
      </Screen>
    )
  }

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}
        >
          <Ionicons name="chevron-back" size={20} color={brand} />
          <Txt variant="smallStrong" color={brand}>Homework</Txt>
        </Pressable>
        <Txt variant="h2" style={{ marginTop: spacing.sm }}>Set homework</Txt>

        {subjects.isLoading ? (
          <SkeletonList rows={5} />
        ) : (subjects.data?.length ?? 0) === 0 ? (
          <Txt variant="body" color={colors.textMuted} style={{ marginTop: spacing.lg }}>
            No teachable subjects are assigned to you yet.
          </Txt>
        ) : (
          <>
            <Txt variant="smallStrong" color={colors.textMuted} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
              Subject
            </Txt>
            <View style={{ gap: spacing.sm, marginBottom: spacing.base }}>
              {(subjects.data ?? []).map((s) => {
                const active = classSubjectId === s.id
                const label = `${s.classLevel.name} · ${s.subject.name}`
                return (
                  <Springy
                    key={s.id}
                    onPress={() => {
                      setClassSubjectId(s.id)
                      setSectionId(undefined)
                    }}
                    accessibilityLabel={label}
                  >
                    <View
                      style={{
                        padding: spacing.md,
                        borderRadius: radius.base,
                        backgroundColor: active ? brand : colors.surface,
                        borderWidth: 1,
                        borderColor: active ? brand : colors.border,
                      }}
                    >
                      <Txt variant="bodyStrong" color={active ? '#fff' : colors.text}>{label}</Txt>
                    </View>
                  </Springy>
                )
              })}
            </View>

            {selected && selected.classLevel.sections.length > 0 ? (
              <>
                <Txt variant="smallStrong" color={colors.textMuted} style={{ marginBottom: spacing.sm }}>
                  Section (optional)
                </Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.base }}>
                  <Chip
                    label="Whole class"
                    active={!sectionId}
                    brand={brand}
                    onPress={() => setSectionId(undefined)}
                  />
                  {selected.classLevel.sections.map((sec) => (
                    <Chip
                      key={sec.id}
                      label={sec.name}
                      active={sectionId === sec.id}
                      brand={brand}
                      onPress={() => setSectionId(sec.id)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <Field label="Title">
              <Input value={title} onChangeText={setTitle} placeholder="e.g. Chapter 4 exercises" />
            </Field>
            <Field label="Instructions (optional)">
              <Input
                value={instructions}
                onChangeText={setInstructions}
                multiline
                style={{ minHeight: 80, textAlignVertical: 'top' }}
              />
            </Field>
            <Field label="Assigned on (YYYY-MM-DD)">
              <Input value={assignedOn} onChangeText={setAssignedOn} autoCapitalize="none" />
            </Field>
            <Field label="Due on (YYYY-MM-DD)">
              <Input value={dueOn} onChangeText={setDueOn} autoCapitalize="none" />
            </Field>
            <Field label="Max score (optional)">
              <Input value={maxScore} onChangeText={setMaxScore} keyboardType="number-pad" />
            </Field>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
              <Chip label="Publish now" active={publish} brand={brand} onPress={() => setPublish(true)} />
              <Chip label="Save draft" active={!publish} brand={brand} onPress={() => setPublish(false)} />
            </View>

            <Button label={publish ? 'Publish homework' : 'Save draft'} onPress={() => void submit()} loading={create.isPending} />
          </>
        )}
      </View>
    </Screen>
  )
}

function Chip({
  label,
  active,
  brand,
  onPress,
}: {
  label: string
  active: boolean
  brand: string
  onPress: () => void
}) {
  return (
    <Springy onPress={onPress} accessibilityLabel={label}>
      <View
        style={{
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.base,
          backgroundColor: active ? brand : colors.surface,
          borderWidth: 1,
          borderColor: active ? brand : colors.border,
        }}
      >
        <Txt variant="caption" color={active ? '#fff' : colors.textMuted}>{label}</Txt>
      </View>
    </Springy>
  )
}
