/**
 * Poll /api/health and POST to ALERT_WEBHOOK_URL when the service is degraded.
 *
 *   ALERT_WEBHOOK_URL=https://hooks.slack.com/... npm run health:watch
 *
 * Optional:
 *   HEALTH_URL=http://localhost:3000/api/health
 *   HEALTH_INTERVAL_MS=30000
 *   HEALTH_FAIL_THRESHOLD=3   consecutive failures before alert
 */
import 'dotenv/config'

const HEALTH_URL = process.env.HEALTH_URL ?? 'http://127.0.0.1:3000/api/health'
const WEBHOOK = process.env.ALERT_WEBHOOK_URL
const INTERVAL = Number(process.env.HEALTH_INTERVAL_MS ?? 30_000)
const THRESHOLD = Number(process.env.HEALTH_FAIL_THRESHOLD ?? 3)

if (!WEBHOOK) {
  console.error('Set ALERT_WEBHOOK_URL to a Slack/Discord/generic webhook.')
  process.exit(1)
}

let consecutiveFails = 0
let alerted = false

async function tick() {
  const started = Date.now()
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(8000) })
    const body = (await res.json()) as {
      status?: string
      checks?: Record<string, unknown>
    }
    const ok = res.status === 200 && body.status === 'ok'
    const latency = Date.now() - started

    if (ok) {
      if (alerted) {
        await notify(`Recovered: ${HEALTH_URL} is healthy again (${latency}ms).`)
        alerted = false
      }
      consecutiveFails = 0
      console.log(`[health-watch] ok ${latency}ms`)
      return
    }

    consecutiveFails += 1
    console.warn(`[health-watch] degraded status=${body.status} fails=${consecutiveFails}`)
    if (consecutiveFails >= THRESHOLD && !alerted) {
      await notify(
        `ALERT: ${HEALTH_URL} degraded (${consecutiveFails}×).\n` +
          `status=${body.status}\nchecks=${JSON.stringify(body.checks ?? {})}`,
      )
      alerted = true
    }
  } catch (err) {
    consecutiveFails += 1
    console.error('[health-watch] request failed', err)
    if (consecutiveFails >= THRESHOLD && !alerted) {
      await notify(
        `ALERT: ${HEALTH_URL} unreachable (${consecutiveFails}×).\n${String(err)}`,
      )
      alerted = true
    }
  }
}

async function notify(text: string) {
  try {
    await fetch(WEBHOOK!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
    })
    console.log('[health-watch] alert sent')
  } catch (err) {
    console.error('[health-watch] webhook failed', err)
  }
}

console.log(`[health-watch] polling ${HEALTH_URL} every ${INTERVAL}ms`)
void tick()
setInterval(() => void tick(), INTERVAL)
