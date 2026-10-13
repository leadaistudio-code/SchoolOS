'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, Pencil, Star, Trash2 } from 'lucide-react'
import { deleteGradingScaleAction, setDefaultGradingScaleAction } from '../actions'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { useToast } from '@/components/ui/toast'

export function ScaleActions({ id, name, isDefault, examCount }: { id: string; name: string; isDefault: boolean; examCount: number }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, title: string) =>
    startTransition(async () => {
      const result = await fn()
      toast.push({ tone: result.ok ? 'success' : 'error', title: result.ok ? title : 'Could not complete that', description: result.message })
      if (result.ok) router.refresh()
    })

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Link href={`/exams/grades?edit=${id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
        <Pencil aria-hidden /> Edit
      </Link>
      <Link href={`/exams/grades?copy=${id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
        <Copy aria-hidden /> Duplicate
      </Link>
      {!isDefault ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setDefaultGradingScaleAction(id), 'Default scale changed')}>
          <Star aria-hidden /> Make default
        </Button>
      ) : null}
      {!isDefault && examCount === 0 ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Delete the grading scale “${name}”?`)) run(() => deleteGradingScaleAction(id), 'Scale deleted')
          }}
        >
          <Trash2 aria-hidden /> Delete
        </Button>
      ) : null}
    </div>
  )
}
