import React from 'react'
import { Alert, Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { ScreenHeader, SectionTitle } from '@/components/header'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Screen, SkeletonList, Txt } from '@/components/ui'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { colors, spacing } from '@/theme'
import { useCreateTask, useSetFrogs, useTapasyaDashboard, useTaskUpdate, type TapasyaTask } from '@/tapasya/api'

/** Today's tasks, the frogs among them, and quick capture. */
export default function TapasyaPlanScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const { data, isLoading, error, refetch, isRefetching } = useTapasyaDashboard()
  const setFrogs = useSetFrogs()
  const update = useTaskUpdate()
  const create = useCreateTask()
  const [frogs, setFrogIds] = React.useState<string[]>([])
  const [primary, setPrimary] = React.useState<string | null>(null)
  const [title, setTitle] = React.useState('')
  const [minutes, setMinutes] = React.useState('25')

  React.useEffect(() => {
    if (!data) return
    setFrogIds(data.today.frogs.map((f) => f.id))
    setPrimary(data.today.primaryFrog?.id ?? null)
  }, [data])

  const header = <ScreenHeader title="Plan & Frogs" subtitle="Eat the frog: hardest, most important task first" tint={brand} onBack={() => router.back()} />
  if (isLoading) return <Screen padded={false} header={header}><View style={{ padding: spacing.base }}><SkeletonList rows={5} /></View></Screen>
  if (error || !data) return <Screen padded={false} header={header}><ErrorState message={error instanceof ApiError ? error.message : 'Could not load.'} onRetry={refetch} /></Screen>

  function toggleFrog(t: TapasyaTask) {
    if (frogs.includes(t.id)) {
      setFrogIds(frogs.filter((f) => f !== t.id))
      if (primary === t.id) setPrimary(null)
    } else if (frogs.length >= 5) {
      Alert.alert('Five frogs at most', 'A short list is easier to finish.')
    } else {
      setFrogIds([...frogs, t.id])
      if (!primary) setPrimary(t.id)
    }
  }

  async function saveFrogs() {
    try {
      await setFrogs.mutateAsync({ taskIds: frogs, primaryTaskId: primary })
      Alert.alert('Frogs saved')
    } catch (err) {
      Alert.alert('Not saved', err instanceof ApiError ? err.message : 'Please try again.')
    }
  }

  async function markDone(t: TapasyaTask) {
    try {
      await update.mutateAsync({ id: t.id, status: 'DONE' })
    } catch (err) {
      Alert.alert('Not saved', err instanceof ApiError ? err.message : 'Please try again.')
    }
  }

  async function add() {
    try {
      await create.mutateAsync({ title: title.trim(), estimatedMinutes: Math.max(5, Number(minutes) || 25) })
      setTitle('')
    } catch (err) {
      Alert.alert('Not added', err instanceof ApiError ? err.message : 'Please try again.')
    }
  }

  return (
    <Screen scroll padded={false} refreshing={isRefetching} onRefresh={refetch} header={header}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
        <Card>
          <Field label="New task"><Input value={title} onChangeText={setTitle} maxLength={120} placeholder="e.g. Chemistry chapter 4 questions" /></Field>
          <Field label="Estimate (minutes)"><Input value={minutes} onChangeText={setMinutes} keyboardType="number-pad" maxLength={3} /></Field>
          <Button label="Add task" onPress={() => void add()} loading={create.isPending} disabled={!title.trim()} />
        </Card>

        <SectionTitle tint={brand}>Open tasks</SectionTitle>
        {data.today.open.length === 0 ? <EmptyState title="Nothing open" body="Add a task above, or wait for your teacher to assign one." /> : null}
        {data.today.open.map((t) => {
          const isFrog = frogs.includes(t.id)
          return (
            <Card key={t.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Pressable onPress={() => toggleFrog(t)} accessibilityRole="checkbox" accessibilityState={{ checked: isFrog }} accessibilityLabel={`Frog: ${t.title}`} hitSlop={8}>
                  <Ionicons name={isFrog ? 'checkbox' : 'square-outline'} size={24} color={isFrog ? brand : colors.textSubtle} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">{t.title}</Txt>
                  <Txt variant="caption" color={colors.textSubtle}>~{t.estimatedMinutes} min{t.dueOn ? ` · due ${t.dueOn}` : ''}</Txt>
                </View>
                {isFrog ? (
                  <Pressable onPress={() => setPrimary(t.id)} accessibilityRole="radio" accessibilityState={{ selected: primary === t.id }} accessibilityLabel="Make primary frog" hitSlop={8}>
                    <Ionicons name={primary === t.id ? 'star' : 'star-outline'} size={22} color={primary === t.id ? colors.warning : colors.textSubtle} />
                  </Pressable>
                ) : null}
              </View>
              {t.isTeacherAssigned ? <View style={{ marginTop: spacing.sm }}><Badge label={t.isMandatory ? 'Required by teacher' : 'From teacher'} tone={t.isMandatory ? 'warning' : 'info'} /></View> : null}
              {t.teacherInstructions ? <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.xs }}>{t.teacherInstructions}</Txt> : null}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <Button label="Focus" variant="secondary" onPress={() => router.push({ pathname: '/(app)/tapasya-focus', params: { task: t.id } })} style={{ flex: 1 }} />
                <Button label="Done" variant="ghost" onPress={() => void markDone(t)} style={{ flex: 1 }} />
              </View>
            </Card>
          )
        })}
        {data.today.open.length ? <Button label={`Save today’s frogs (${frogs.length})`} onPress={() => void saveFrogs()} loading={setFrogs.isPending} style={{ marginTop: spacing.sm }} /> : null}
        <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.md }}>Tick up to five frogs and star the one you will do first. Finishing your starred frog, after focusing on it today, earns a bonus once a day.</Txt>
      </View>
    </Screen>
  )
}
