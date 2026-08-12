import { z } from 'zod'

export const addDomainSchema = z.object({
  host: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Must be a valid domain name'),
})

export type AddDomainInput = z.infer<typeof addDomainSchema>
