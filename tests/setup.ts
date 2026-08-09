import { config } from 'dotenv'

// Tests run against the seeded development database by default. Point
// DATABASE_URL at a scratch database in CI.
config({ path: '.env' })

// NODE_ENV is read-only in the Next.js type environment, so assign through the
// env record rather than the typed property.
const env = process.env as Record<string, string | undefined>
env.NODE_ENV ??= 'test'
env.AUTH_SECRET ??= 'test-secret-value-that-is-long-enough-for-zod-validation'
