import { z } from 'zod'
import type { PlatformContext } from '@/server/context'
import { ForbiddenError } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { audit } from '@/server/audit'
import { assistantConfigured, assistantModel } from '@/server/assistant/providers'
import { zodToJsonSchema } from '@/server/assistant/json-schema'
import { transcribeWithWhisper } from '@/server/assistant/speech/whisper-stt'
import { whisperSttConfigured } from '@/server/assistant/speech/voices'
import { normalizePhone } from '@/server/auth/phone'
import { CONTACT_ROLES, LEAD_SOURCES, STAGE_LABELS, type CrmStage } from '@/lib/growth-crm'

/**
 * Voice field capture: a sales rep describes a school visit in Hindi, English
 * or a mix, and gets the capture form back filled in for review. Nothing is
 * saved here; the rep confirms on the form.
 */

export const VOICE_CAPTURE_STAGES = ['PROSPECT', 'CONTACTED', 'MEETING_SCHEDULED', 'DEMO_COMPLETED', 'FOLLOW_UP'] as const

const draftSchema = z.object({
  isVisitNote: z.boolean().describe('False when the transcript is not a description of a school sales visit or call (noise, gibberish, unrelated talk).'),
  schoolName: z.string().optional(),
  city: z.string().optional(),
  contactName: z.string().optional(),
  contactDesignation: z.enum(CONTACT_ROLES).optional().catch(undefined),
  contactMobile: z.string().optional(),
  contactEmail: z.string().optional(),
  isDecisionMaker: z.boolean().optional(),
  visitDate: z.string().optional(),
  visitSummary: z.string().optional(),
  currentErp: z.string().optional(),
  primaryObjection: z.string().optional(),
  stage: z.enum(VOICE_CAPTURE_STAGES).optional().catch(undefined),
  leadSource: z.enum(LEAD_SOURCES).optional().catch(undefined),
  followUpDate: z.string().optional(),
  followUpTime: z.string().optional(),
  nextAction: z.string().optional(),
})

export type VoiceVisitDraft = Omit<z.infer<typeof draftSchema>, 'isVisitNote' | 'visitSummary'> & {
  visitSummary: string
  /** Required form fields the rep did not mention, as labels. */
  missing: string[]
}

export type VoiceSchoolMatch = {
  id: string
  name: string
  city: string | null
  stage: CrmStage
  stageLabel: string
  likely: boolean
}

export type VoiceCaptureResult = {
  transcript: string
  draft: VoiceVisitDraft
  matches: VoiceSchoolMatch[]
}

const MAX_AUDIO_BYTES = 20_000_000

function istToday() {
  const now = new Date()
  return {
    date: now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    weekday: now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long' }),
    time: now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
  }
}

const SYSTEM = (today: ReturnType<typeof istToday>) => `You turn a MyCampusView sales rep's spoken notes about a school visit into CRM fields.
MyCampusView sells school ERP software to schools in India. The rep may speak Hindi, English or Hinglish; the transcript may be in Devanagari, Roman script or both.

Today is ${today.weekday}, ${today.date}, ${today.time} India time. Resolve relative dates against it: "kal"/"tomorrow" = next day, "parso" = day after tomorrow, "agle hafte"/"next week" = 7 days, "Monday ko" = the next Monday after today.

Rules:
- Write every field in English. Transliterate names to Roman script (e.g. "शर्मा जी" -> "Mr Sharma"); keep school and person names as spoken.
- Only fill a field the rep actually said or clearly implied. Never invent names, numbers, emails or dates. Leave unknown fields out.
- city: locality and city as spoken, e.g. "Sector 62, Noida" or "Saket, New Delhi".
- contactMobile: digits only, as spoken ("nine eight one..." / "नौ आठ" -> 981...). Omit if not said.
- visitSummary: a clear English summary of the conversation in 2-8 short sentences: interest level, pain points, current system, budget, who decides, competitors, what was promised. No filler.
- stage: PROSPECT (no real conversation), CONTACTED (met and talked), MEETING_SCHEDULED (a meeting/demo is booked), DEMO_COMPLETED (demo given), FOLLOW_UP (waiting on them).
- leadSource: SCHOOL_VISIT unless the rep says otherwise (referral, cold call, event...).
- followUpDate as YYYY-MM-DD, followUpTime as HH:mm 24h, only if mentioned. nextAction is a short imperative ("Send proposal", "Book demo with chairman").
- isVisitNote: false if the transcript is noise, gibberish or not about a school visit or call; then leave every other field out.
Call emit_visit exactly once.`

export async function transcribeVisitNote(file: File): Promise<string> {
  if (!whisperSttConfigured()) {
    throw new ApiException(503, 'UNAVAILABLE', 'Voice capture needs OpenAI speech-to-text (AI_DRIVER=openai and AI_API_KEY).')
  }
  if (file.size < 1_000) throw new ApiException(400, 'BAD_REQUEST', 'The recording was too short. Hold on and speak for a few seconds.')
  if (file.size > MAX_AUDIO_BYTES) throw new ApiException(400, 'BAD_REQUEST', 'The recording is too long. Keep it under 5 minutes.')

  const mimeType = file.type || 'audio/webm'
  const audio = {
    bytes: Buffer.from(await file.arrayBuffer()),
    filename: file.name || `visit.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`,
    mimeType,
  }
  try {
    // gpt-4o-transcribe keeps Hinglish as spoken; whisper-1 auto-detect tends to translate it and lose details.
    return (await transcribeWithWhisper({ ...audio, autoDetect: true, model: 'gpt-4o-transcribe' })).transcript
  } catch {
    try {
      return (await transcribeWithWhisper({ ...audio, language: 'hi-IN' })).transcript
    } catch (err) {
      throw new ApiException(502, 'UPSTREAM', err instanceof Error ? err.message : 'Could not transcribe the recording')
    }
  }
}

export async function extractVisitDraft(ctx: PlatformContext, transcript: string): Promise<VoiceCaptureResult> {
  if (!ctx.user.permissions.has('platform.crm_create')) {
    throw new ForbiddenError('Missing permission: platform.crm_create')
  }
  const text = transcript.trim()
  if (text.replace(/[\s\p{P}]/gu, '').length < 10) {
    throw new ApiException(422, 'EMPTY', 'Nothing was heard in the recording. Please try again closer to the phone.')
  }
  if (!assistantConfigured()) {
    throw new ApiException(503, 'UNAVAILABLE', 'Voice capture needs the AI assistant to be configured.')
  }

  const result = await assistantModel().turn({
    system: SYSTEM(istToday()),
    turns: [{ role: 'user', text: `Transcript of the rep's voice note:\n"""${text.slice(0, 12_000)}"""` }],
    tools: [
      {
        name: 'emit_visit',
        description: 'Return the visit details extracted from the voice note.',
        parameters: zodToJsonSchema(draftSchema),
      },
    ],
    toolChoice: 'emit_visit',
    onText: () => {},
  })

  const call = result.toolCalls.find((c) => c.name === 'emit_visit')
  if (result.refused || !call) {
    throw new ApiException(502, 'UPSTREAM', 'Could not understand the voice note. Please try again or fill the form by hand.')
  }
  const fields = Object.fromEntries(
    Object.entries(JSON.parse(call.argumentsJson) as Record<string, unknown>).filter(([, v]) => v !== null && v !== ''),
  )
  const parsed = draftSchema.parse(fields)
  if (!parsed.isVisitNote || !parsed.visitSummary?.trim()) {
    throw new ApiException(
      422,
      'NOT_A_VISIT',
      'We could not make out a visit description in that recording. Please try again and speak clearly about the school.',
    )
  }
  const draft = sanitise(parsed)
  const matches = await matchSchools(ctx, draft)

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim(),
    action: 'crm.voice_capture',
    module: 'growth',
    entityType: 'CrmSchool',
    entityId: matches.find((m) => m.likely)?.id,
    summary: `Voice note understood${draft.schoolName ? ` for ${draft.schoolName}` : ''}`,
  })

  return { transcript: text, draft, matches }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/

function sanitise({ isVisitNote: _, ...draft }: z.infer<typeof draftSchema>): VoiceVisitDraft {
  const clean = (v?: string) => v?.trim() || undefined
  const digits = draft.contactMobile?.replace(/[^\d+]/g, '')
  const email = clean(draft.contactEmail)?.toLowerCase()
  const out = {
    ...draft,
    schoolName: clean(draft.schoolName),
    city: clean(draft.city),
    contactName: clean(draft.contactName),
    contactMobile: digits && digits.replace(/\D/g, '').length >= 8 ? (normalizePhone(digits) ?? digits) : undefined,
    contactEmail: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
    visitDate: draft.visitDate && DATE.test(draft.visitDate) ? draft.visitDate : undefined,
    followUpDate: draft.followUpDate && DATE.test(draft.followUpDate) ? draft.followUpDate : undefined,
    followUpTime: draft.followUpTime && TIME.test(draft.followUpTime) ? draft.followUpTime : undefined,
    currentErp: clean(draft.currentErp),
    primaryObjection: clean(draft.primaryObjection),
    nextAction: clean(draft.nextAction),
    visitSummary: (draft.visitSummary ?? '').trim(),
  }
  const missing = [
    !out.schoolName && 'school name',
    !out.city && 'area / city',
    !out.contactName && 'who you met',
    !out.contactMobile && 'contact number',
    !out.followUpDate && 'follow-up date',
    !out.nextAction && 'next action',
  ].filter((v): v is string => !!v)
  return { ...out, missing }
}

const NAME_NOISE = new Set([
  'school', 'schools', 'public', 'international', 'the', 'convent', 'academy', 'senior', 'secondary', 'sr', 'sec',
  'high', 'higher', 'vidyalaya', 'model', 'english', 'medium', 'global', 'world', 'and', 'of',
])

function nameTokens(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !NAME_NOISE.has(t))
}

/** Schools already in the CRM the rep may be talking about, best first. */
async function matchSchools(ctx: PlatformContext, draft: VoiceVisitDraft): Promise<VoiceSchoolMatch[]> {
  const tokens = draft.schoolName ? nameTokens(draft.schoolName) : []
  const phone = draft.contactMobile
  if (tokens.length === 0 && !phone) return []

  const candidates = await ctx.db.crmSchool.findMany({
    where: {
      deletedAt: null,
      OR: [
        ...tokens.map((t) => ({ name: { contains: t, mode: 'insensitive' as const } })),
        ...(phone
          ? [{ phone }, { contacts: { some: { deletedAt: null, OR: [{ mobile: phone }, { whatsapp: phone }] } } }]
          : []),
      ],
    },
    select: {
      id: true,
      name: true,
      city: true,
      stage: true,
      phone: true,
      contacts: { where: { deletedAt: null }, select: { mobile: true, whatsapp: true } },
    },
    take: 25,
  })

  const city = draft.city?.toLowerCase()
  return candidates
    .map((s) => {
      const theirs = new Set(nameTokens(s.name))
      const overlap = tokens.length ? tokens.filter((t) => theirs.has(t)).length / Math.max(tokens.length, theirs.size) : 0
      const phoneHit =
        !!phone && (s.phone === phone || s.contacts.some((c) => c.mobile === phone || c.whatsapp === phone))
      const cityHit = !!city && !!s.city && (s.city.toLowerCase().includes(city) || city.includes(s.city.toLowerCase()))
      const score = overlap + (phoneHit ? 1 : 0) + (cityHit ? 0.2 : 0)
      return { s, score, likely: phoneHit || overlap >= 0.99 || (overlap >= 0.5 && cityHit) }
    })
    .filter((m) => m.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ s, likely }, i) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      stage: s.stage as CrmStage,
      stageLabel: STAGE_LABELS[s.stage as CrmStage],
      likely: likely && i === 0,
    }))
}
