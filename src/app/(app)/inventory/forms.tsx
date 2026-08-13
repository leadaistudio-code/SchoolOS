'use client'

import { useActionState } from 'react'
import { createAssetAction, assetActionForm } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

export function CreateAssetForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createAssetAction, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Field label="Name" htmlFor="name" required>
        <Input id="name" name="name" required />
      </Field>
      <Field label="Asset code" htmlFor="assetCode" required>
        <Input id="assetCode" name="assetCode" required />
      </Field>
      <Field label="Category" htmlFor="categoryId">
        <Select id="categoryId" name="categoryId" defaultValue="">
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Location" htmlFor="location">
        <Input id="location" name="location" />
      </Field>
      <Field label="Quantity" htmlFor="quantity">
        <Input id="quantity" name="quantity" type="number" min={1} defaultValue={1} />
      </Field>
      <Button type="submit" loading={pending} block>
        Register asset
      </Button>
    </form>
  )
}

export function AssetLifecycleForm({ assetId }: { assetId: string }) {
  const bound = assetActionForm.bind(null, assetId)
  const [state, action, pending] = useActionState(bound, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Action" htmlFor="action">
        <Select id="action" name="action" defaultValue="MOVED">
          <option value="MOVED">Moved</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="RETURNED">Returned</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="DISPOSED">Disposed</option>
        </Select>
      </Field>
      <Field label="Location" htmlFor="location">
        <Input id="location" name="location" />
      </Field>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} />
      </Field>
      <Button type="submit" loading={pending} size="sm">
        Record
      </Button>
    </form>
  )
}
