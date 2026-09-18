'use client'

import * as React from 'react'
import { Check, ChevronRight, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  createRoleAction,
  deleteRoleAction,
  setRolePermissionsAction,
} from '../admin-actions'

export type ModuleGroup = { module: string; permissions: { key: string; label: string }[] }

/** Read-only permission catalogue for built-in and custom roles. */
export function RolePermissionViewer({
  name,
  description,
  members,
  isSystem,
  catalogue,
  granted,
}: {
  name: string
  description?: string | null
  members: number
  isSystem: boolean
  catalogue: ModuleGroup[]
  granted: string[]
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const grantedSet = React.useMemo(() => new Set(granted), [granted])
  const normalizedQuery = query.trim().toLowerCase()
  const groups = catalogue
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter((permission) => {
        if (!grantedSet.has(permission.key)) return false
        if (!normalizedQuery) return true
        return `${group.module} ${permission.label} ${permission.key}`
          .toLowerCase()
          .includes(normalizedQuery)
      }),
    }))
    .filter((group) => group.permissions.length > 0)

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQuery('')
          setOpen(true)
        }}
        className="group inline-flex items-center gap-1 text-left text-sm font-semibold text-ink hover:text-[var(--brand-600)]"
        aria-label={`View permissions for ${name}`}
      >
        <span>{name}</span>
        <ChevronRight
          className="size-3.5 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--brand-600)]"
          aria-hidden
        />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={`${name} permissions`}
        description={description ?? 'Permissions granted to this role.'}
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <span className="rounded-full bg-[var(--product-50)] px-2 py-1 font-semibold text-[var(--product-600)]">
                {granted.length} permissions
              </span>
              <span>{members} {members === 1 ? 'person has' : 'people have'} this role</span>
              <span>· {isSystem ? 'Built-in role' : 'Custom school role'}</span>
            </div>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search permissions"
              className="pl-8"
              aria-label={`Search ${name} permissions`}
            />
          </div>

          {groups.length === 0 ? (
            <p className="rounded-[var(--radius-sm)] bg-surface-2 px-3 py-6 text-center text-sm text-ink-muted">
              {normalizedQuery ? 'No permissions match that search.' : 'This role has no permissions.'}
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <section key={group.module}>
                  <div className="mb-2 flex items-center justify-between gap-3 border-b border-line pb-1.5">
                    <h3 className="text-sm font-semibold capitalize text-ink">
                      {group.module.replaceAll('_', ' ')}
                    </h3>
                    <span className="text-xs text-ink-subtle">
                      {group.permissions.length}
                    </span>
                  </div>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {group.permissions.map((permission) => (
                      <li
                        key={permission.key}
                        className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-surface-2 px-2.5 py-2"
                      >
                        <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-success-bg text-success">
                          <Check className="size-3" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm text-ink">{permission.label}</span>
                          <span className="block break-all text-xs text-ink-subtle">
                            {permission.key}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </>
  )
}

/** Creating a role, optionally starting from an existing one. */
export function NewRoleButton({
  copyFrom,
  label = 'New role',
}: {
  copyFrom: { id: string; label: string }[]
  label?: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [copyFromRoleId, setCopyFromRoleId] = React.useState('')

  const submit = () =>
    startTransition(async () => {
      const result = await createRoleAction({
        name: name.trim(),
        description: description.trim() || undefined,
        copyFromRoleId: copyFromRoleId || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not create role', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Role created', description: result.message })
      setOpen(false)
      setName('')
      setDescription('')
      setCopyFromRoleId('')
    })

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New role"
        description="Roles belong to this school only. Start from a built-in role and adjust it."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={name.trim().length < 2}>
              Create role
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Name" htmlFor="role-name" required>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Exam coordinator"
              autoFocus
            />
          </Field>

          <Field label="What it is for" htmlFor="role-desc" hint="Optional, shown in the list">
            <Input
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Runs the exam calendar and publishes results"
            />
          </Field>

          <Field
            label="Start from"
            htmlFor="role-copy"
            hint="Copies that role's permissions. You can edit them afterwards."
          >
            <Select
              id="role-copy"
              value={copyFromRoleId}
              onChange={(e) => setCopyFromRoleId(e.target.value)}
            >
              <option value="">No permissions to begin with</option>
              {copyFrom.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Dialog>
    </>
  )
}

/**
 * Editing a role's permissions.
 *
 * Grouped by module with a select-all per group, because permissions are
 * granted in blocks in practice — somebody either runs the library or they do
 * not — and a flat list of three hundred checkboxes is where mistakes live.
 */
export function RoleControls({
  id,
  name,
  members,
  catalogue,
  granted,
}: {
  id: string
  name: string
  members: number
  catalogue: ModuleGroup[]
  granted: string[]
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [open, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(new Set(granted))
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  const toggle = (key: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const toggleModule = (group: ModuleGroup, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      for (const permission of group.permissions) {
        if (on) next.add(permission.key)
        else next.delete(permission.key)
      }
      return next
    })

  const save = () =>
    startTransition(async () => {
      const result = await setRolePermissionsAction({ id, permissionKeys: [...selected] })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not save', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Permissions saved', description: result.message })
      setOpen(false)
    })

  const remove = () =>
    startTransition(async () => {
      const result = await deleteRoleAction(id)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Role deleted' : 'Could not delete',
        description: result.message,
      })
      if (result.ok) setConfirmingDelete(false)
    })

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          setSelected(new Set(granted))
          setOpen(true)
        }}
      >
        Permissions
      </Button>

      {confirmingDelete ? (
        <>
          <Button size="sm" variant="danger" loading={pending} onClick={remove}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          disabled={members > 0}
          title={members > 0 ? `${members} people still hold this role` : undefined}
          onClick={() => setConfirmingDelete(true)}
        >
          Delete
        </Button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={`Permissions for ${name}`}
        description={
          members > 0
            ? `${members} people hold this role. Changes apply at their next sign-in.`
            : 'Nobody holds this role yet.'
        }
        footer={
          <>
            <Button onClick={save} loading={pending}>
              Save {selected.size} permissions
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {catalogue.map((group) => {
            const on = group.permissions.filter((p) => selected.has(p.key)).length
            const all = on === group.permissions.length

            return (
              <div key={group.module}>
                <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-line pb-1">
                  <span className="text-sm font-medium capitalize text-ink">
                    {group.module.replace(/_/g, ' ')}
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-[var(--brand-600)] hover:underline"
                    onClick={() => toggleModule(group, !all)}
                  >
                    {all ? 'Clear all' : `Select all ${group.permissions.length}`}
                  </button>
                </div>

                <ul className="grid gap-1 sm:grid-cols-2">
                  {group.permissions.map((permission) => (
                    <li key={permission.key}>
                      <label className="flex items-start gap-2">
                        <Checkbox
                          className="mt-0.5"
                          checked={selected.has(permission.key)}
                          onChange={(e) => toggle(permission.key, e.target.checked)}
                        />
                        <span className="min-w-0 text-sm text-ink">
                          {permission.label}
                          <span className="ml-1 text-xs text-ink-subtle">{permission.key}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </Dialog>
    </div>
  )
}
