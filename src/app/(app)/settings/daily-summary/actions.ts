'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireContext } from '@/server/context'
import { saveDigestSettings, sendDigestTest } from '@/server/modules/daily-ops/digest'

export type ActionResult = { ok: boolean; message: string }

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 09:30')

const schema = z.object({
  morningEnabled: z.boolean(),
  morningTime: time,
  eveningEnabled: z.boolean(),
  eveningTime: time,
  skipSundays: z.boolean(),
  recipientUserIds: z.array(z.string()).max(25),
  extraPhones: z
    .array(
      z.object({
        name: z.string().trim().max(60),
        phone: z.string().trim().refine((p) => p.replace(/\D/g, '').length >= 10, 'Enter a full mobile number'),
      }),
    )
    .max(10),
})

export async function saveDigestAction(input: z.infer<typeof schema>): Promise<ActionResult> {
  const ctx = await requireContext('settings.manage')
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the form' }
  if (parsed.data.morningEnabled && parsed.data.eveningEnabled && parsed.data.eveningTime <= parsed.data.morningTime) {
    return { ok: false, message: 'The evening summary must be later than the morning one.' }
  }
  try {
    await saveDigestSettings(ctx, parsed.data)
    revalidatePath('/settings/daily-summary')
    const n = parsed.data.recipientUserIds.length + parsed.data.extraPhones.length
    return {
      ok: true,
      message: n > 0 ? `Saved. ${n} recipient${n === 1 ? '' : 's'} will get the summaries.` : 'Saved. Add a recipient to start sending.',
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not save' }
  }
}

export async function sendTestAction(slot: 'morning' | 'evening'): Promise<ActionResult> {
  const ctx = await requireContext('settings.manage')
  try {
    await sendDigestTest(ctx, slot)
    return { ok: true, message: 'Sent to you — check notifications and WhatsApp.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not send' }
  }
}
