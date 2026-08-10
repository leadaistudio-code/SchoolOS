'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard } from 'lucide-react'
import { startPaymentAction } from './actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'

type StudentDue = { id: string; name: string; dueMinor: number }

/**
 * Starts an online payment.
 *
 * Nothing here confirms anything: the button creates a server-side INITIATED
 * payment and hands off to the gateway. The money only becomes real when a
 * signed webhook comes back.
 */
export function PayNow({ students, currency }: { students: StudentDue[]; currency: string }) {
  const router = useRouter()
  const toast = useToast()
  const payable = students.filter((s) => s.dueMinor > 0)

  const [open, setOpen] = React.useState(false)
  const [studentId, setStudentId] = React.useState(payable[0]?.id ?? '')
  const [amount, setAmount] = React.useState(
    payable[0] ? String(payable[0].dueMinor / 100) : '',
  )
  const [pending, startTransition] = React.useTransition()

  const selected = payable.find((s) => s.id === studentId)

  const submit = () => {
    startTransition(async () => {
      const result = await startPaymentAction({
        studentId,
        amount: Number(amount),
      })

      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not start payment', description: result.message })
        return
      }

      const url = result.data?.checkoutUrl
      if (url) router.push(url)
      else router.refresh()
    })
  }

  if (payable.length === 0) return null

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CreditCard aria-hidden />
        Pay now
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Pay fees"
        size="sm"
        description="You will be taken to a secure payment page."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!amount || Number(amount) <= 0}>
              Continue to payment
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {payable.length > 1 ? (
            <Field label="Paying for" htmlFor="pay-student">
              <Select
                id="pay-student"
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value)
                  const next = payable.find((s) => s.id === e.target.value)
                  if (next) setAmount(String(next.dueMinor / 100))
                }}
              >
                {payable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {formatMoney(s.dueMinor, currency)} due
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field
            label="Amount"
            htmlFor="pay-amount"
            hint={
              selected
                ? `${formatMoney(selected.dueMinor, currency)} outstanding. Part payment is accepted.`
                : undefined
            }
          >
            <Input
              id="pay-amount"
              type="number"
              min={1}
              max={selected ? selected.dueMinor / 100 : undefined}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tnum"
            />
          </Field>
        </div>
      </Dialog>
    </>
  )
}
