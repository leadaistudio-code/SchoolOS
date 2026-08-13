'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { emptyFormState, type FormState } from '@/lib/form-state'
import {
  addBlock,
  createPage,
  createPost,
  deleteBlock,
  ensureDefaultHomePage,
  updatePage,
} from '@/server/modules/website/service'
import { cmsBlockSchema, cmsPageSchema, cmsPostSchema } from '@/server/modules/website/schema'

function fail(error: unknown, fallback: string): FormState {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: 'Please correct the highlighted fields', fieldErrors }
  }
  if (error instanceof ApiException) return { error: error.message, fieldErrors: {} }
  return { error: error instanceof Error ? error.message : fallback, fieldErrors: {} }
}

export async function createPageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('website.manage')
  try {
    const raw = Object.fromEntries(formData.entries())
    const page = await createPage(
      ctx,
      cmsPageSchema.parse({
        ...raw,
        showInNav: formData.get('showInNav') === 'on',
        isPublished: formData.get('isPublished') === 'on',
      }),
    )
    revalidatePath('/website')
    redirect(`/website/pages/${page.id}`)
  } catch (error) {
    if (typeof error === 'object' && error && 'digest' in error) throw error
    return fail(error, 'Could not create page')
  }
}

export async function ensureHomeAction(): Promise<{ ok: boolean; message: string }> {
  const ctx = await requireContext('website.manage')
  try {
    await ensureDefaultHomePage(ctx)
    revalidatePath('/website')
    return { ok: true, message: 'Home page ready' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not create home' }
  }
}

export async function updatePageAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('website.manage')
  try {
    const raw = Object.fromEntries(formData.entries())
    await updatePage(
      ctx,
      id,
      cmsPageSchema.parse({
        ...raw,
        showInNav: formData.get('showInNav') === 'on',
        isPublished: formData.get('isPublished') === 'on',
      }),
    )
    revalidatePath('/website')
    revalidatePath(`/website/pages/${id}`)
    revalidatePath('/site-pages')
    return { ...emptyFormState, ok: true, message: 'Page saved' }
  } catch (error) {
    return fail(error, 'Could not save page')
  }
}

export async function addBlockAction(
  pageId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('website.manage')
  try {
    await addBlock(ctx, pageId, cmsBlockSchema.parse(Object.fromEntries(formData.entries())))
    revalidatePath(`/website/pages/${pageId}`)
    return { ...emptyFormState, ok: true, message: 'Block added' }
  } catch (error) {
    return fail(error, 'Could not add block')
  }
}

export async function deleteBlockAction(
  pageId: string,
  blockId: string,
): Promise<{ ok: boolean; message: string }> {
  const ctx = await requireContext('website.manage')
  try {
    await deleteBlock(ctx, blockId)
    revalidatePath(`/website/pages/${pageId}`)
    return { ok: true, message: 'Block removed' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not remove' }
  }
}

export async function createPostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('website.manage')
  try {
    const raw = Object.fromEntries(formData.entries())
    await createPost(
      ctx,
      cmsPostSchema.parse({
        ...raw,
        isPublished: formData.get('isPublished') === 'on',
      }),
    )
    revalidatePath('/website')
    return { ...emptyFormState, ok: true, message: 'Post created' }
  } catch (error) {
    return fail(error, 'Could not create post')
  }
}
