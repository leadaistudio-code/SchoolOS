import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import {
  ID_CARD_DESIGNS,
  defaultIdCardSettings,
  type IdCardSettings,
} from '@/lib/id-cards/designs'

export type IdCardKind = 'student' | 'staff'

const NS = 'id_cards'
const PERMISSION: Record<IdCardKind, string> = { student: 'students.id_cards', staff: 'staff.id_cards' }

const settingsSchema = z.object({
  design: z.string().refine((v) => ID_CARD_DESIGNS.some((d) => d.key === v), 'Unknown design'),
  orientation: z.enum(['horizontal', 'vertical']),
  showBack: z.boolean(),
  showQr: z.boolean(),
  fields: z.array(z.string().max(30)).max(12),
  rules: z.string().max(600),
  signatureLabel: z.string().trim().max(40),
})

export async function loadIdCardSettings(ctx: AppContext, kind: IdCardKind): Promise<IdCardSettings> {
  ctx.require(PERMISSION[kind])
  const defaults = defaultIdCardSettings(kind)
  const row = await ctx.db.setting.findFirst({
    where: { namespace: NS, key: kind },
    select: { value: true },
  })
  const parsed = settingsSchema.partial().safeParse(row?.value ?? {})
  return parsed.success ? { ...defaults, ...parsed.data } : defaults
}

export async function saveIdCardSettings(ctx: AppContext, kind: IdCardKind, input: unknown) {
  ctx.require(PERMISSION[kind])
  const data = settingsSchema.parse(input)
  await ctx.db.setting.upsert({
    where: { tenantId_namespace_key: { tenantId: ctx.tenant.id, namespace: NS, key: kind } },
    create: { tenantId: ctx.tenant.id, namespace: NS, key: kind, value: data },
    update: { value: data },
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim(),
    action: 'id_cards.settings_update',
    module: kind === 'student' ? 'students' : 'staff',
    summary: `Saved ${kind} ID card design: ${data.design}, ${data.orientation}`,
    after: data,
  })
  return data
}
