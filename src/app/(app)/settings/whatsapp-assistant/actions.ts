'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { saveAssistantSettings, type AssistantConfig } from '@/server/modules/whatsapp-bot/service'

export async function saveAssistantAction(config: AssistantConfig): Promise<{ ok: boolean; message: string }> {
  const ctx = await requireContext('settings.manage')
  try {
    const saved = await saveAssistantSettings(ctx, config)
    revalidatePath('/settings/whatsapp-assistant')
    return { ok: true, message: saved.enabled ? 'Assistant is on' : 'Assistant is off' }
  } catch (error) {
    if (error instanceof ZodError) return { ok: false, message: error.issues[0]?.message ?? 'Check the form' }
    return { ok: false, message: error instanceof Error ? error.message : 'Could not save' }
  }
}
