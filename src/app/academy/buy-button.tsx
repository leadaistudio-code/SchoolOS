'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { confirmPurchaseAction, confirmSimulatedPurchaseAction, startPurchaseAction } from './actions'

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void }
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

export function BuyButton({ courseId, label, simulated }: { courseId: string; label: string; simulated: boolean }) {
  const router = useRouter()
  const { push } = useToast()
  const [pending, setPending] = React.useState(false)
  const [testOrder, setTestOrder] = React.useState<{ orderId: string; amount: string; title: string } | null>(null)

  function done(result: { ok: boolean; message: string; courseId?: string }) {
    push({ tone: result.ok ? 'success' : 'error', title: result.message })
    if (result.ok) router.push(`/my/learning/${result.courseId ?? courseId}`)
    else setPending(false)
  }

  async function buy() {
    setPending(true)
    const start = await startPurchaseAction(courseId)
    if (!start.ok) {
      push({ tone: 'error', title: start.message })
      setPending(false)
      return
    }
    if (start.kind === 'owned' || start.kind === 'enrolled') {
      push({ tone: 'success', title: start.kind === 'owned' ? 'You already have this course.' : 'You are enrolled. Enjoy the course!' })
      router.push(`/my/learning/${start.courseId}`)
      return
    }
    if (start.kind === 'simulated') {
      setTestOrder({ orderId: start.orderId, amount: `₹${(start.amountMinor / 100).toLocaleString('en-IN')}`, title: start.courseTitle })
      setPending(false)
      return
    }
    if (!(await loadCheckout()) || !window.Razorpay) {
      push({ tone: 'error', title: 'The payment window could not load. Check your connection and try again.' })
      setPending(false)
      return
    }
    const checkout = new window.Razorpay({
      key: start.keyId,
      order_id: start.providerOrderId,
      amount: start.amountMinor,
      currency: start.currency,
      name: 'MyCampusView Academy',
      description: start.courseTitle,
      prefill: start.prefill,
      theme: { color: getComputedStyle(document.documentElement).getPropertyValue('--brand-500').trim() || undefined },
      handler: async (response: RazorpayResponse) => {
        done(
          await confirmPurchaseAction({
            orderId: start.orderId,
            paymentId: response.razorpay_payment_id,
            providerOrderId: response.razorpay_order_id,
            signature: response.razorpay_signature,
          }),
        )
      },
      modal: { ondismiss: () => setPending(false) },
    })
    checkout.on('payment.failed', (r) => {
      push({ tone: 'error', title: r.error?.description ?? 'The payment failed. You can try again.' })
    })
    checkout.open()
  }

  return (
    <>
      <Button block size="lg" loading={pending} onClick={buy}>
        <ShoppingCart /> {label}
      </Button>
      {simulated ? <p className="text-xs text-warning">Test mode: payments are simulated on this server.</p> : null}
      <Dialog
        open={!!testOrder}
        onClose={() => setTestOrder(null)}
        title="Test payment"
        description="Razorpay keys are not set on this server, so no real money moves. This only works outside production."
        footer={
          <>
            <Button variant="secondary" onClick={() => setTestOrder(null)}>Cancel</Button>
            <Button
              loading={pending}
              onClick={async () => {
                if (!testOrder) return
                setPending(true)
                const result = await confirmSimulatedPurchaseAction(testOrder.orderId)
                setTestOrder(null)
                done(result)
              }}
            >
              Pay {testOrder?.amount}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">{testOrder?.title}</p>
      </Dialog>
    </>
  )
}
