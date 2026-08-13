'use client'

import { useActionState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addBlockAction,
  createPageAction,
  createPostAction,
  deleteBlockAction,
  ensureHomeAction,
  updatePageAction,
} from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

export function CreatePageForm() {
  const [state, action, pending] = useActionState(createPageAction, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" required />
      </Field>
      <Field label="Slug" htmlFor="slug" required hint="URL path, e.g. about">
        <Input id="slug" name="slug" required placeholder="about" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="showInNav" defaultChecked />
        Show in navigation
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublished" />
        Publish now
      </label>
      <Button type="submit" loading={pending} block>
        Create page
      </Button>
    </form>
  )
}

export function EnsureHomeButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await ensureHomeAction()
          router.refresh()
        })
      }
    >
      Create default home page
    </Button>
  )
}

export function UpdatePageForm({
  page,
}: {
  page: {
    id: string
    title: string
    slug: string
    seoTitle: string | null
    seoDescription: string | null
    showInNav: boolean
    isPublished: boolean
  }
}) {
  const bound = updatePageAction.bind(null, page.id)
  const [state, action, pending] = useActionState(bound, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" required defaultValue={page.title} />
      </Field>
      <Field label="Slug" htmlFor="slug" required>
        <Input id="slug" name="slug" required defaultValue={page.slug} />
      </Field>
      <Field label="SEO title" htmlFor="seoTitle">
        <Input id="seoTitle" name="seoTitle" defaultValue={page.seoTitle ?? ''} />
      </Field>
      <Field label="SEO description" htmlFor="seoDescription">
        <Textarea id="seoDescription" name="seoDescription" rows={2} defaultValue={page.seoDescription ?? ''} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="showInNav" defaultChecked={page.showInNav} />
        Show in navigation
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublished" defaultChecked={page.isPublished} />
        Published
      </label>
      <Button type="submit" loading={pending} size="sm">
        Save page
      </Button>
    </form>
  )
}

export function AddBlockForm({ pageId }: { pageId: string }) {
  const bound = addBlockAction.bind(null, pageId)
  const [state, action, pending] = useActionState(bound, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Block type" htmlFor="kind">
        <Select id="kind" name="kind" defaultValue="TEXT">
          <option value="HERO">Hero</option>
          <option value="TEXT">Text</option>
          <option value="CTA">Call to action</option>
          <option value="ENQUIRE">Enquiry link</option>
        </Select>
      </Field>
      <Field label="Heading" htmlFor="heading">
        <Input id="heading" name="heading" />
      </Field>
      <Field label="Body" htmlFor="body">
        <Textarea id="body" name="body" rows={4} />
      </Field>
      <Button type="submit" loading={pending} size="sm">
        Add block
      </Button>
    </form>
  )
}

export function DeleteBlockButton({ pageId, blockId }: { pageId: string; blockId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await deleteBlockAction(pageId, blockId)
          router.refresh()
        })
      }
    >
      Remove
    </Button>
  )
}

export function CreatePostForm() {
  const [state, action, pending] = useActionState(createPostAction, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" required />
      </Field>
      <Field label="Slug" htmlFor="slug" required>
        <Input id="slug" name="slug" required />
      </Field>
      <Field label="Excerpt" htmlFor="excerpt">
        <Input id="excerpt" name="excerpt" />
      </Field>
      <Field label="Body" htmlFor="body" required>
        <Textarea id="body" name="body" rows={6} required />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublished" />
        Publish
      </label>
      <Button type="submit" loading={pending} size="sm">
        Create post
      </Button>
    </form>
  )
}
