import React from 'react'
import { Alert, FlatList, Pressable, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useCollectPayment, useStudent, useStudentInvoices, useStudents } from '@/api/hooks'
import { ApiError } from '@/api/client'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  ListRow,
  Screen,
  SkeletonList,
  Springy,
  Txt,
} from '@/components/ui'
import { useAuth } from '@/auth/store'
import { apiDate, fullName, longDate, money } from '@/lib/format'
import { colors, radius, spacing } from '@/theme'
import type { StudentRow } from '@/api/types'

const MODES = [
  { key: 'CASH' as const, label: 'Cash' },
  { key: 'UPI' as const, label: 'UPI' },
  { key: 'CARD' as const, label: 'Card' },
  { key: 'BANK_TRANSFER' as const, label: 'Transfer' },
  { key: 'CHEQUE' as const, label: 'Cheque' },
  { key: 'NET_BANKING' as const, label: 'Net banking' },
]

/**
 * Counter collection on a phone.
 *
 * Search → pick student → amount + mode → receipt. Amount is in rupees (the
 * API converts to paise). Idempotency key stops a double-tap from posting twice.
 */
export default function FeeCollectScreen() {
  const params = useLocalSearchParams<{ studentId?: string }>()
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const canCollect = useAuth((s) => s.can('fees.collect'))

  const [search, setSearch] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [studentId, setStudentId] = React.useState(params.studentId ?? '')
  const [amount, setAmount] = React.useState('')
  const [mode, setMode] = React.useState<(typeof MODES)[number]['key']>('CASH')
  const [reference, setReference] = React.useState('')
  const [notes, setNotes] = React.useState('')

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 280)
    return () => clearTimeout(t)
  }, [search])

  const students = useStudents(debounced)
  const student = useStudent(studentId)
  const invoices = useStudentInvoices(studentId)
  const collect = useCollectPayment()

  const openInvoices = React.useMemo(
    () => (invoices.data ?? []).filter((i) => i.balanceMinor > 0 && i.status !== 'CANCELLED'),
    [invoices.data],
  )
  const dueMinor = openInvoices.reduce((n, i) => n + i.balanceMinor, 0)

  const hits = React.useMemo(() => {
    const pages = students.data?.pages ?? []
    return pages.flatMap((p) => p.data)
  }, [students.data])

  async function submit() {
    if (!studentId) return
    const rupees = Number(amount)
    if (!Number.isFinite(rupees) || rupees <= 0) {
      Alert.alert('Enter an amount', 'Amount must be greater than zero.')
      return
    }
    try {
      const result = await collect.mutateAsync({
        studentId,
        amount: rupees,
        mode,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        paidOn: apiDate(new Date()),
        invoiceIds: openInvoices.map((i) => i.id),
        idempotencyKey: `mobile-${studentId}-${Date.now()}`,
      })
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(
        'Payment recorded',
        `Receipt ${result.receiptNumber} · ${money(result.allocatedMinor)} allocated` +
          (result.unallocatedMinor > 0 ? ` · ${money(result.unallocatedMinor)} advance` : ''),
        [
          {
            text: 'View receipt',
            onPress: () =>
              router.replace({
                pathname: '/(app)/receipt',
                params: { paymentId: result.paymentId },
              }),
          },
          { text: 'Done', style: 'cancel', onPress: () => router.back() },
        ],
      )
    } catch (err) {
      Alert.alert(
        'Could not collect',
        err instanceof ApiError ? err.message : 'Please try again.',
      )
    }
  }

  if (!canCollect) {
    return (
      <Screen>
        <ErrorState message="You do not have permission to collect fees." onRetry={() => router.back()} />
      </Screen>
    )
  }

  return (
    <Screen padded={false} scroll={!!studentId}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
        <Pressable
          onPress={() => (studentId ? setStudentId('') : router.back())}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}
        >
          <Ionicons name="chevron-back" size={20} color={brand} />
          <Txt variant="smallStrong" color={brand}>{studentId ? 'Change student' : 'Fees'}</Txt>
        </Pressable>
        <Txt variant="h2" style={{ marginTop: spacing.sm }}>
          {studentId ? 'Collect payment' : 'Find student'}
        </Txt>
      </View>

      {!studentId ? (
        <View style={{ flex: 1, paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Name or admission number"
            autoFocus
            returnKeyType="search"
          />
          {students.isLoading && debounced.length >= 1 ? (
            <SkeletonList rows={5} />
          ) : (
            <FlatList
              data={hits}
              keyExtractor={(s) => s.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: spacing.xxl, paddingTop: spacing.md }}
              ListEmptyComponent={
                debounced.length >= 2 ? (
                  <EmptyState title="No matches" body="Try another name or admission number." />
                ) : (
                  <EmptyState title="Search to collect" body="Type at least two characters to find a student." />
                )
              }
              renderItem={({ item }) => <StudentHit row={item} onPick={() => {
                setStudentId(item.id)
                setAmount(item.dueMinor > 0 ? String(item.dueMinor / 100) : '')
              }} />}
            />
          )}
        </View>
      ) : (
        <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
          {student.isLoading ? (
            <SkeletonList rows={4} />
          ) : student.error || !student.data ? (
            <ErrorState
              message={student.error instanceof ApiError ? student.error.message : 'Could not load student.'}
              onRetry={student.refetch}
            />
          ) : (
            <>
              <Card>
                <Txt variant="bodyStrong">
                  {fullName(student.data.firstName, student.data.lastName)}
                </Txt>
                <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 2 }}>
                  {[student.data.admissionNo, [student.data.className, student.data.sectionName].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                </Txt>
                {student.data.guardianName ? (
                  <Txt variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
                    Parent: {student.data.guardianName}
                  </Txt>
                ) : null}
                <View style={{ marginTop: spacing.sm }}>
                  <Badge
                    label={dueMinor > 0 ? `${money(dueMinor)} due` : 'Nothing due'}
                    tone={dueMinor > 0 ? 'danger' : 'success'}
                  />
                </View>
              </Card>

              {openInvoices.length > 0 ? (
                <View style={{ marginTop: spacing.lg }}>
                  <Txt variant="smallStrong" color={colors.textSubtle} style={{ marginBottom: spacing.sm }}>
                    OPEN INVOICES
                  </Txt>
                  {openInvoices.map((inv) => (
                    <Card key={inv.id} style={{ marginBottom: spacing.sm }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{inv.number}</Txt>
                        <Txt variant="bodyStrong">{money(inv.balanceMinor)}</Txt>
                      </View>
                      <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: 2 }} numberOfLines={1}>
                        {inv.title} · due {longDate(inv.dueOn)}
                      </Txt>
                    </Card>
                  ))}
                </View>
              ) : null}

              <View style={{ marginTop: spacing.lg }}>
                <Field label="Amount (₹)">
                  <Input
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </Field>

                <Txt variant="smallStrong" color={colors.textMuted} style={{ marginBottom: spacing.sm }}>
                  Mode
                </Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.base }}>
                  {MODES.map((m) => {
                    const active = mode === m.key
                    return (
                      <Springy key={m.key} onPress={() => setMode(m.key)} accessibilityLabel={m.label}>
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
                          <Txt variant="caption" color={active ? '#FFFFFF' : colors.textMuted}>{m.label}</Txt>
                        </View>
                      </Springy>
                    )
                  })}
                </View>

                {mode !== 'CASH' ? (
                  <Field label="Reference">
                    <Input value={reference} onChangeText={setReference} placeholder="UPI / cheque / txn id" />
                  </Field>
                ) : null}

                <Field label="Notes (optional)">
                  <Input value={notes} onChangeText={setNotes} placeholder="Optional" />
                </Field>

                <Button
                  label="Record payment"
                  onPress={submit}
                  loading={collect.isPending}
                  disabled={!amount}
                />
              </View>
            </>
          )}
        </View>
      )}
    </Screen>
  )
}

function StudentHit({ row, onPick }: { row: StudentRow; onPick: () => void }) {
  const klass = [row.className, row.sectionName].filter(Boolean).join(' ')
  return (
    <ListRow
      title={fullName(row.firstName, row.lastName)}
      subtitle={[row.admissionNo, klass, row.guardianName].filter(Boolean).join(' · ')}
      right={
        row.dueMinor > 0 ? (
          <Badge label={money(row.dueMinor)} tone="danger" />
        ) : (
          <Badge label="Clear" tone="success" />
        )
      }
      onPress={onPick}
    />
  )
}
