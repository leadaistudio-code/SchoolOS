'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard } from 'lucide-react'
import { confirmOnlinePaymentAction } from '../../actions'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'

type RazorpayResponse = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}
type RazorpayInstance = {
  open: () => void
  on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

const CHECKOUT_JS = 'https://checkout.razorpay.com/v1/checkout.js'

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true)
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = CHECKOUT_JS
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export function FeeCheckoutClient({
  paymentId,
  providerOrderId,
  keyId,
  amountMinor,
  currency,
  schoolName,
  studentName,
  prefill,
}: {
  paymentId: string
  providerOrderId: string
  keyId: string
  amountMinor: number
  currency: string
  schoolName: string
  studentName: string
  prefill: { name?: string; email?: string; contact?: string }
}) {
  const router = useRouter()
  const { push } = useToast()
  const [pending, setPending] = React.useState(false)
  const opened = React.useRef(false)

  const pay = React.useCallback(async () => {
    setPending(true)
    if (!(await loadCheckout()) || !window.Razorpay) {
      push({ tone: 'error', title: 'The payment window could not load. Check your connection and try again.' })
      setPending(false)
      return
    }
    const checkout = new window.Razorpay({
      key: keyId,
      order_id: providerOrderId,
      amount: amountMinor,
      currency,
      name: schoolName,
      description: `School fees — ${studentName}`,
      prefill,
      theme: {
        color:
          getComputedStyle(document.documentElement).getPropertyValue('--brand-500').trim() || undefined,
      },
      handler: async (response: RazorpayResponse) => {
        const result = await confirmOnlinePaymentAction({
          paymentId,
          providerOrderId: response.razorpay_order_id,
          providerPaymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        })
        push({
          tone: result.ok ? 'success' : 'error',
          title: result.message,
        })
        if (result.ok) router.push(`/finance/payments/${paymentId}`)
        else setPending(false)
      },
      modal: {
        ondismiss: () => {
          setPending(false)
          router.push('/finance')
        },
      },
    })
    checkout.on('payment.failed', (r) => {
      push({ tone: 'error', title: r.error?.description ?? 'The payment failed. You can try again.' })
      setPending(false)
    })
    checkout.open()
  }, [amountMinor, currency, keyId, paymentId, prefill, providerOrderId, push, router, schoolName, studentName])

  React.useEffect(() => {
    if (opened.current) return
    opened.current = true
    void pay()
  }, [pay])

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-line bg-surface p-8 text-center">
      <CreditCard className="size-10 text-[var(--brand-600)]" aria-hidden />
      <div>
        <h1 className="text-lg font-semibold text-ink">Pay school fees</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {studentName} · {formatMoney(amountMinor, currency)}
        </p>
        <p className="mt-1 text-xs text-ink-subtle">{schoolName}</p>
      </div>
      <Button loading={pending} onClick={pay}>
        Open payment window
      </Button>
      <button type="button" className="text-sm text-ink-muted hover:text-ink" onClick={() => router.push('/finance')}>
        Cancel and go back
      </button>
    </div>
  )
}
