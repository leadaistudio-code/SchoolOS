import 'dotenv/config'
import { env } from '../src/lib/env'
import { sendParentMessage } from '../src/server/messaging/send'
import { smsProvider, whatsappProvider } from '../src/server/providers'
import { twilioConfigured } from '../src/server/providers/twilio'

/**
 * Checks Twilio WhatsApp + SMS configuration and optionally sends a test message.
 *
 *   npm run messaging:doctor
 *   npm run messaging:doctor -- +919876543210
 */

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

const pass = (text: string) => console.log(`${GREEN}  ok${RESET}    ${text}`)
const fail = (text: string) => console.log(`${RED}  fail${RESET}  ${text}`)
const note = (text: string) => console.log(`${DIM}        ${text}${RESET}`)

async function main() {
  const recipient = process.argv[2]
  const e = env()

  console.log('\nMessaging configuration')
  console.log('-----------------------')
  console.log(`  WhatsApp driver     ${e.WHATSAPP_DRIVER}`)
  console.log(`  SMS driver          ${e.SMS_DRIVER}`)
  console.log(`  Failover to SMS     ${e.MESSAGING_WHATSAPP_FAILOVER_SMS ? 'yes' : 'no'}`)
  console.log(`  Twilio account      ${e.TWILIO_ACCOUNT_SID ? `${e.TWILIO_ACCOUNT_SID.slice(0, 6)}…` : '(not set)'}`)
  console.log(`  WhatsApp from       ${e.TWILIO_WHATSAPP_FROM ?? '(not set)'}`)
  console.log(`  SMS from            ${e.TWILIO_SMS_FROM ?? e.SMS_SENDER_ID ?? '(not set)'}`)

  if (e.WHATSAPP_DRIVER === 'twilio' || e.SMS_DRIVER === 'twilio') {
    if (!twilioConfigured()) {
      fail('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required for the Twilio driver.')
      process.exit(1)
    }
    pass('Twilio credentials present')
  }

  const wa = whatsappProvider()
  const sms = smsProvider()

  if (wa.name === 'log' && sms.name === 'log') {
    fail('Both WhatsApp and SMS are on the log driver — nothing is sent for real.')
    note('Set WHATSAPP_DRIVER=twilio and SMS_DRIVER=twilio with Twilio credentials.')
    process.exit(1)
  }

  pass(`WhatsApp provider: ${wa.name}`)
  pass(`SMS provider: ${sms.name}`)

  if (!recipient) {
    note('Pass a phone number to send a test: npm run messaging:doctor -- +919876543210')
    return
  }

  console.log('\nSending test (WhatsApp first, SMS failover if enabled)')
  console.log('--------------------------------------------------------')
  const result = await sendParentMessage({
    to: recipient,
    body: `MyCampusView test message at ${new Date().toISOString()}`,
  })

  if (result.ok) {
    pass(`Delivered via ${result.channel ?? 'unknown'} (${result.providerMessageId})`)
    if (result.failedWhatsApp) note(`WhatsApp error was: ${result.failedWhatsApp}`)
  } else {
    fail(result.error ?? 'Send failed')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
