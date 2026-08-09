'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard } from 'lucide-react'
import { startPaymentAction } from './actions'
import { Button } from '@/components/ui/button'
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
      <Button size="lg" onClick={() => setOpen(true)}>
        <CreditCard className="size-5" aria-hidden />
        Pay now
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-60 grid place-items-center p-4 bg-black/45"
          role="dialog"
          aria-modal="true"
          aria-label="Pay fees"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md bg-surface border border-line rounded-[var(--radius)] shadow-2xl p-5">
            <h2 className="text-[15px] font-semibold text-ink">Pay fees</h2>
            <p className="text-[13px] text-ink-muted mt-0.5">
              You will be taken to a secure payment page.
            </p>

            <div className="space-y-4 mt-4">
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
                    ? `${formatMoney(selected.dueMinor, currency)} outstanding. You may pay part of it.`
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
                />
              </Field>
            </div>

            <div className="flex items-center gap-2 mt-5">
              <Button
                onClick={submit}
                loading={pending}
                disabled={!amount || Number(amount) <= 0}
              >
                Continue to payment
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
