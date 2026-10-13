import { TALLY_ERROR, tallyErrorMessage, type TallyTransport } from './types'

const BLOCKED_HOSTS = new Set([
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
])

/**
 * SSRF guard for DIRECT mode. Cloud SaaS should use CONNECTOR mode instead.
 * Only private / loopback targets are allowed, and only when the deployment
 * explicitly opts in via TALLY_ALLOW_DIRECT=1.
 */
export function assertDirectHostAllowed(host: string): void {
  if (process.env.TALLY_ALLOW_DIRECT !== '1') {
    throw new Error(tallyErrorMessage(TALLY_ERROR.SSRF_BLOCKED))
  }
  const normalised = host.trim().toLowerCase()
  if (!normalised || BLOCKED_HOSTS.has(normalised)) {
    throw new Error(tallyErrorMessage(TALLY_ERROR.SSRF_BLOCKED))
  }
  // Block obvious public cloud metadata / link-local
  if (normalised.startsWith('169.254.')) {
    throw new Error(tallyErrorMessage(TALLY_ERROR.SSRF_BLOCKED))
  }
  // Allow localhost, RFC1918, and hostnames (on-prem / VPN)
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(normalised)
  if (isIp) {
    const ok =
      normalised === '127.0.0.1' ||
      normalised.startsWith('10.') ||
      normalised.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalised)
    if (!ok) {
      throw new Error(tallyErrorMessage(TALLY_ERROR.SSRF_BLOCKED))
    }
  }
}

export function createHttpTransport(host: string, port: number): TallyTransport {
  assertDirectHostAllowed(host)
  const base = `http://${host}:${port}`

  return {
    async postXml(xml, timeoutMs) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const started = Date.now()
      try {
        const res = await fetch(base, {
          method: 'POST',
          headers: { 'content-type': 'application/xml', accept: 'application/xml, text/xml, */*' },
          body: xml,
          signal: controller.signal,
        })
        const body = await res.text()
        return { status: res.status, body, latencyMs: Date.now() - started }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (/abort/i.test(message)) {
          throw new Error(tallyErrorMessage(TALLY_ERROR.TIMEOUT))
        }
        throw new Error(tallyErrorMessage(TALLY_ERROR.OFFLINE))
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

/** Transport used by unit tests / dry-run without a live Tally. */
export function createMockTransport(handler: (xml: string) => string | Promise<string>): TallyTransport {
  return {
    async postXml(xml) {
      const started = Date.now()
      const body = await handler(xml)
      return { status: 200, body, latencyMs: Date.now() - started }
    },
  }
}
