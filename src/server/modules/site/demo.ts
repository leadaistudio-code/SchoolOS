import { z } from 'zod'
import { prisma } from '@/server/db/prisma'
import { audit } from '@/server/audit'

/**
 * Demo requests from the public website.
 *
 * Stored as a Job on the `sales` queue rather than in a bespoke table. The row
 * is durable, carries its payload, and is already the mechanism the product
 * uses for work that has to survive a restart — so a request is never lost
 * because an email provider was unreachable when it arrived.
 *
 * There is no tenant on these rows: an enquiry arrives before a school exists.
 */
export const demoRequestSchema = z.object({
  name: z.string().trim().min(2, 'Please tell us your name').max(120),
  email: z.string().trim().email('Please check this email address').max(180),
  phone: z.string().trim().min(6, 'Please include a phone number').max(30),
  school: z.string().trim().min(2, 'Please tell us the name of your school').max(180),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  schoolType: z.enum([
    'PRIVATE_SCHOOL',
    'INTERNATIONAL_SCHOOL',
    'PRESCHOOL',
    'K12',
    'SCHOOL_GROUP',
    'OTHER',
  ]),
  size: z.enum(['UNDER_300', '300_1000', '1000_3000', '3000_10000', 'OVER_10000']),
  interest: z.enum([
    'EVERYTHING',
    'STUDENT_RECORDS',
    'FEES',
    'TRANSPORT',
    'COMMUNICATION',
    'OTHER',
  ]),
  contactPreference: z.enum(['PHONE', 'EMAIL', 'WHATSAPP']),
  message: z.string().trim().max(4000).optional(),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Please confirm we may contact you' }),
  }),
  // Honeypot. Accepted by the schema on purpose: rejecting it here would tell
  // an automated submitter which field gave it away. The route discards the
  // request quietly instead.
  website: z.string().max(200).optional(),
})

export type DemoRequestInput = z.infer<typeof demoRequestSchema>

export async function recordDemoRequest(
  input: DemoRequestInput,
  meta: { ip: string | null; userAgent: string | null; referer: string | null },
) {
  const job = await prisma.job.create({
    data: {
      tenantId: null,
      queue: 'sales',
      name: 'demo.request',
      payload: {
        ...input,
        receivedAt: new Date().toISOString(),
        ip: meta.ip,
        userAgent: meta.userAgent,
        referer: meta.referer,
      } as never,
    },
    select: { id: true },
  })

  await audit({
    tenantId: null,
    actorLabel: input.email,
    action: 'site.demo.request',
    module: 'marketing',
    entityType: 'Job',
    entityId: job.id,
    summary: `Demo requested by ${input.school} (${input.schoolType.toLowerCase().replaceAll('_', ' ')})`,
  })

  return job
}
