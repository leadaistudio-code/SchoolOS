'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive } from 'lucide-react'
import { retireBusAction } from '../../actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'

/**
 * Taking a bus off the road.
 *
 * A confirmation step rather than a plain button: retiring a vehicle hides it
 * from every route picker at once, and the service refuses outright while
 * children are still assigned to it — so the dialog explains the consequence
 * before the refusal has to.
 */
export function RetireBusButton({ busId, code }: { busId: string; code: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  const retire = async () => {
    setPending(true)
    const result = await retireBusAction(busId)
    setPending(false)
    toast.push({
      tone: result.ok ? 'success' : 'error',
      title: result.ok ? 'Bus retired' : 'Could not retire',
      description: result.message,
    })
    if (result.ok) {
      setOpen(false)
      router.push('/transport/buses')
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Archive className="size-4" aria-hidden />
        Retire
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Retire ${code}?`}
        size="sm"
        description="The bus leaves the fleet list, route pickers and the live map. Its trip and maintenance history is kept."
      >
        <div className="flex items-center gap-2">
          <Button variant="danger" onClick={retire} loading={pending}>
            Retire bus
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </Dialog>
    </>
  )
}
