'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  sendUserInviteAction,
  setTemporaryPasswordAction,
  setUserRolesAction,
  setUserStatusAction,
} from '../admin-actions'

export type RoleOption = { id: string; label: string }

/** Role and status filters, kept in the URL beside the search term. */
export function UserFilters({
  roles,
  roleId,
  status,
}: {
  roles: RoleOption[]
  roleId: string
  status: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const push = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    // Any filter change invalidates the page cursor.
    next.delete('page')
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
      <Select
        value={status}
        aria-label="Filter by status"
        className="w-40"
        onChange={(e) => push('status', e.target.value)}
      >
        <option value="">Any status</option>
        <option value="ACTIVE">Active</option>
        <option value="INVITED">Invited</option>
        <option value="DISABLED">Disabled</option>
      </Select>

      <Select
        value={roleId}
        aria-label="Filter by role"
        className="w-52"
        disabled={roles.length === 0}
        onChange={(e) => push('roleId', e.target.value)}
      >
        <option value="">Any role</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </Select>
    </div>
  )
}

/**
 * Per-account controls.
 *
 * Disabling is one click because it is the urgent action — somebody has left
 * and their access has to go today. Changing roles opens a dialog, because
 * getting a role set wrong is quiet and lasting, and a checklist you can read
 * before saving prevents more mistakes than a confirmation after.
 */
export function UserRow({
  id,
  name,
  status,
  roleIds,
  roles,
  canEdit,
  canAssign,
  isSelf,
}: {
  id: string
  name: string
  status: string
  roleIds: string[]
  roles: RoleOption[]
  canEdit: boolean
  canAssign: boolean
  isSelf: boolean
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [open, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<string[]>(roleIds)
  const [tempPassword, setTempPassword] = React.useState<{
    value: string
    expiresAt: string | null
  } | null>(null)
  const [copied, setCopied] = React.useState(false)

  const setStatus = (next: string) =>
    startTransition(async () => {
      const result = await setUserStatusAction({ id, status: next })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Account updated' : 'Could not update',
        description: result.message,
      })
    })

  const invite = () =>
    startTransition(async () => {
      const result = await sendUserInviteAction({ id })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Invitation sent' : 'Could not send invitation',
        description: result.message,
      })
    })

  const issueTempPassword = () =>
    startTransition(async () => {
      const result = await setTemporaryPasswordAction({ id })
      if (!result.ok || !result.password) {
        toast.push({
          tone: 'error',
          title: 'Could not issue a password',
          description: result.message,
        })
        return
      }
      // Held in component state only. It is never fetched again, because the
      // server kept a bcrypt digest and not the password itself.
      setTempPassword({ value: result.password, expiresAt: result.expiresAt ?? null })
      setCopied(false)
    })

  const saveRoles = () =>
    startTransition(async () => {
      const result = await setUserRolesAction({ id, roleIds: selected })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not save roles', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Roles updated', description: result.message })
      setOpen(false)
    })

  return (
    <div className="flex items-center justify-end gap-1.5">
      {canEdit && status !== 'DISABLED' ? (
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={invite}
          title="Email a link to set a password"
        >
          {status === 'INVITED' ? 'Resend invite' : 'Send reset link'}
        </Button>
      ) : null}

      {/* For the people email never reaches: a wrong address, a dead mailbox,
          a parent who does not use email. Without this they are a support
          ticket, which is what self-service was meant to end. */}
      {canEdit && status !== 'DISABLED' && !isSelf ? (
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={issueTempPassword}
          title="Generate a password to read out over the phone or hand over at the office"
        >
          Temp password
        </Button>
      ) : null}

      {canAssign && roles.length > 0 ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelected(roleIds)
            setOpen(true)
          }}
        >
          Roles
        </Button>
      ) : null}

      {canEdit ? (
        status === 'DISABLED' ? (
          <Button size="sm" variant="secondary" loading={pending} onClick={() => setStatus('ACTIVE')}>
            Enable
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            loading={pending}
            disabled={isSelf}
            title={isSelf ? 'You cannot disable your own account' : undefined}
            onClick={() => setStatus('DISABLED')}
          >
            Disable
          </Button>
        )
      ) : null}

      {/* Shown once and never again — the server stored a bcrypt digest, so
          there is nothing to come back for. Says so plainly, because an
          administrator who assumes they can reopen it will close it early. */}
      <Dialog
        open={!!tempPassword}
        onClose={() => setTempPassword(null)}
        title={`Temporary password for ${name}`}
        description="Read this out or hand it over now. It cannot be shown again."
        footer={
          <Button onClick={() => setTempPassword(null)}>Done</Button>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-[var(--radius-sm)] bg-surface-2 border border-line px-3 py-2.5 text-lg font-semibold tracking-wide text-ink select-all">
              {tempPassword?.value}
            </code>
            <Button
              variant="secondary"
              onClick={() => {
                if (!tempPassword) return
                void navigator.clipboard.writeText(tempPassword.value)
                setCopied(true)
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <ul className="text-xs text-ink-muted space-y-1 list-disc pl-4">
            <li>
              {tempPassword?.expiresAt
                ? `Expires ${new Date(tempPassword.expiresAt).toLocaleString()}.`
                : 'Expires in 24 hours.'}
            </li>
            <li>They must choose their own password the first time they sign in.</li>
            <li>Any device already signed in to this account has been signed out.</li>
          </ul>
        </div>
      </Dialog>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Roles for ${name}`}
        description="Roles decide what this person can see and do. Changes apply at their next sign-in."
        footer={
          <>
            <Button onClick={saveRoles} loading={pending}>
              Save roles
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <ul className="space-y-1.5">
          {roles.map((role) => (
            <li key={role.id}>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={selected.includes(role.id)}
                  onChange={(e) =>
                    setSelected((current) =>
                      e.target.checked
                        ? [...current, role.id]
                        : current.filter((r) => r !== role.id),
                    )
                  }
                />
                <span className="text-sm text-ink">{role.label}</span>
              </label>
            </li>
          ))}
        </ul>

        {selected.length === 0 ? (
          <p className="mt-3 text-xs text-warning">
            With no role this account can sign in but will see nothing.
          </p>
        ) : null}
      </Dialog>
    </div>
  )
}
