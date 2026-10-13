'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { SearchCheck } from 'lucide-react'
import {
  createCrmLeadFromDiscoveryAction,
  findContactsAction,
  markVerifiedAction,
  rejectDiscoveryAction,
  runDiscoveryNowAction,
} from './actions'

export function FindContactsButton({ id, label = 'Find contact details' }: { id: string; label?: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = React.useTransition()
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await findContactsAction(id)
          toast.push({
            tone: result.ok ? 'success' : 'error',
            title: result.ok ? 'Contact search finished' : 'Contact search failed',
            description: result.message,
          })
          router.refresh()
        })
      }
    >
      <SearchCheck aria-hidden /> {pending ? 'Searching Maps, web and school site…' : label}
    </Button>
  )
}

export function RunDiscoveryButton() {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = React.useTransition()

  return (
    <Button
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await runDiscoveryNowAction()
          if (!result.ok) {
            toast.push({ tone: 'error', title: 'Discovery failed', description: result.message })
            return
          }
          toast.push({ tone: 'success', title: 'Discovery run complete', description: result.message })
          router.refresh()
        })
      }
    >
      Run discovery now
    </Button>
  )
}

export function CandidateActions({
  id,
  crmSchoolId,
  website,
  compact = false,
}: {
  id: string
  crmSchoolId: string | null
  website: string | null
  /** One row for table cells. */
  compact?: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = React.useTransition()

  return (
    <div
      className={
        compact
          ? 'flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap'
          : 'flex flex-wrap items-center gap-2'
      }
    >
      {website ? (
        <a
          href={website}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-[var(--brand-600)] hover:underline"
        >
          {compact ? 'Website' : 'Open website'}
        </a>
      ) : null}
      {crmSchoolId ? (
        <a
          href={`/platform/growth/schools/${crmSchoolId}`}
          className="text-sm font-medium text-[var(--brand-600)] hover:underline"
        >
          {compact ? 'CRM lead' : 'Open CRM lead'}
        </a>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={() =>
            start(async () => {
              const result = await createCrmLeadFromDiscoveryAction(id)
              if (!result.ok) {
                toast.push({ tone: 'error', title: 'Could not create lead', description: result.message })
                return
              }
              toast.push({ tone: 'success', title: result.message })
              router.refresh()
              if (result.ok && 'schoolId' in result && result.schoolId) {
                router.push(`/platform/growth/schools/${result.schoolId}`)
              }
            })
          }
        >
          {compact ? 'Add to CRM' : 'Create CRM lead'}
        </Button>
      )}
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await markVerifiedAction(id)
            toast.push({
              tone: result.ok ? 'success' : 'error',
              title: result.message,
            })
            router.refresh()
          })
        }
      >
        {compact ? 'Verify' : 'Mark verified'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await rejectDiscoveryAction(id)
            toast.push({
              tone: result.ok ? 'success' : 'error',
              title: result.message,
            })
            router.refresh()
          })
        }
      >
        Reject
      </Button>
    </div>
  )
}
