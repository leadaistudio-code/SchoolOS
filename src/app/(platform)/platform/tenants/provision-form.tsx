'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

type Plan = { id: string; name: string }

/**
 * Submits via the platform API so multipart uploads and session cookies behave
 * reliably on production hosts (Railway, split app/marketing deployments).
 */
export function ProvisionSchoolForm({ plans }: { plans: Plan[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = React.useState(false)

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPending(true)
    const form = e.currentTarget
    const data = new FormData(form)

    try {
      const res = await fetch('/api/v1/platform/tenants', {
        method: 'POST',
        body: data,
        credentials: 'same-origin',
      })
      const json = await res.json().catch(() => ({}))

      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent('/platform/tenants')}`
        return
      }

      if (!res.ok) {
        const message =
          json?.error?.message ?? json?.message ?? 'Could not provision the school'
        toast.push({ tone: 'error', title: 'Provisioning failed', description: message })
        return
      }

      const tenantId = json?.data?.tenant?.id
      toast.push({ tone: 'success', title: 'School created' })
      router.push(tenantId ? `/platform/tenants/${tenantId}` : '/platform/tenants')
      router.refresh()
    } catch {
      toast.push({
        tone: 'error',
        title: 'Provisioning failed',
        description: 'Network error — please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">Slug (subdomain)</span>
        <Input name="slug" required placeholder="st-johns or St John's" />
        <span className="text-xs text-ink-subtle">
          Spaces and capitals are converted automatically (e.g. &quot;St Johns&quot; → st-johns).
        </span>
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">School name</span>
        <Input name="schoolName" required />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">Admin email</span>
        <Input name="adminEmail" type="email" required />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">Admin password</span>
        <Input name="adminPassword" type="password" required minLength={10} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">Plan</span>
        <select
          name="planId"
          required
          className="w-full h-9 rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="trial" defaultChecked />
        Start on trial
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">Header logo</span>
        <Input
          name="logo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm file:mr-2 file:rounded-[var(--radius-sm)] file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs"
        />
        <span className="text-xs text-ink-subtle">
          Shown in the sign-in page, sidebar and app header. JPEG, PNG or WebP.
        </span>
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">Login banner</span>
        <Input
          name="banner"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm file:mr-2 file:rounded-[var(--radius-sm)] file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs"
        />
        <span className="text-xs text-ink-subtle">
          Wide image on the sign-in page and dashboard welcome strip.
        </span>
      </label>
      <Button type="submit" className="w-full" loading={pending}>
        Create school
      </Button>
    </form>
  )
}
