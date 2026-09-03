import 'dotenv/config'
import { env } from '../src/lib/env'
import { whatsappProvider } from '../src/server/providers'

/**
 * Will a password-reset code actually reach a parent's phone?
 *
 *   npm run whatsapp:doctor                     report the configuration only
 *   npm run whatsapp:doctor -- +919876543210    also send a real code there
 *
 * This exists because the failure is silent by design. `WHATSAPP_DRIVER`
 * defaults to `log`, and the log driver reports success — so the reset screen
 * advances to "enter your code" exactly as it would on a working system, and
 * nothing is ever sent. Nobody finds out until a locked-out parent phones the
 * office.
 *
 * Every step is checked in the order it fails in real life: is a driver even
 * selected, do the credentials resolve against Meta, and does the template send.
 * A failure names the step rather than leaving somebody to guess between six
 * possible causes.
 *
 * Run it where the question is being asked. Inside Railway:
 *
 *   railway ssh --service <web service>
 *   npm run whatsapp:doctor -- +919876543210
 */

const GREEN = '[32m'
const RED = '[31m'
const YELLOW = '[33m'
const DIM = '[2m'
const RESET = '[0m'

const pass = (text: string) => console.log(`${GREEN}  ok${RESET}    ${text}`)
const fail = (text: string) => console.log(`${RED}  fail${RESET}  ${text}`)
const warn = (text: string) => console.log(`${YELLOW}  warn${RESET}  ${text}`)
const note = (text: string) => console.log(`${DIM}        ${text}${RESET}`)

function heading(text: string) {
  console.log(`\n${text}`)
  console.log('-'.repeat(text.length))
}

async function main() {
  const recipient = process.argv[2]
  const e = env()

  heading('Configuration')

  console.log(`  driver              ${e.WHATSAPP_DRIVER}`)
  console.log(`  template            ${e.WHATSAPP_OTP_TEMPLATE}`)
  console.log(`  template language   ${e.WHATSAPP_OTP_TEMPLATE_LANG}`)
  console.log(`  copy-code button    ${e.WHATSAPP_OTP_COPY_BUTTON ? 'yes' : 'no'}`)

  if (e.WHATSAPP_DRIVER === 'log') {
    fail('WHATSAPP_DRIVER is "log" — codes are printed to the server log, never sent.')
    note('This is the default. Set WHATSAPP_DRIVER=twilio (or meta_cloud / gupshup) to send for real.')
    note('The reset screen still advances to "enter your code", which is why this looks like')
    note('a delivery problem rather than a configuration one.')
    console.log('')
    process.exit(1)
  }

  if (e.WHATSAPP_DRIVER === 'gupshup') {
    const missing = [
      !e.GUPSHUP_API_KEY && 'GUPSHUP_API_KEY',
      !e.GUPSHUP_APP_NAME && 'GUPSHUP_APP_NAME',
      !e.GUPSHUP_SOURCE_NUMBER && 'GUPSHUP_SOURCE_NUMBER',
    ].filter(Boolean)

    if (missing.length > 0) {
      fail(`Gupshup is selected but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set.`)
      note('With anything missing the provider silently falls back to the log driver.')
      process.exit(1)
    }
    pass('Gupshup credentials are present.')
  }

  if (e.WHATSAPP_DRIVER === 'meta_cloud') {
    const missing = [
      !e.WHATSAPP_PHONE_NUMBER_ID && 'WHATSAPP_PHONE_NUMBER_ID',
      !e.WHATSAPP_ACCESS_TOKEN && 'WHATSAPP_ACCESS_TOKEN',
    ].filter(Boolean)

    if (missing.length > 0) {
      fail(`Meta Cloud is selected but ${missing.join(' and ')} not set.`)
      note('With either missing the provider silently falls back to the log driver.')
      process.exit(1)
    }
    pass('Meta Cloud credentials are present.')

    await checkMetaNumber(e.WHATSAPP_PHONE_NUMBER_ID!, e.WHATSAPP_ACCESS_TOKEN!, e.WHATSAPP_API_VERSION)
  }

  if (e.WHATSAPP_DRIVER === 'twilio') {
    const missing = [
      !e.TWILIO_ACCOUNT_SID && 'TWILIO_ACCOUNT_SID',
      !e.TWILIO_AUTH_TOKEN && 'TWILIO_AUTH_TOKEN',
      !e.TWILIO_WHATSAPP_FROM && !e.TWILIO_MESSAGING_SERVICE_SID && 'TWILIO_WHATSAPP_FROM',
    ].filter(Boolean)

    if (missing.length > 0) {
      fail(`Twilio is selected but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set.`)
      note('WHATSAPP_OTP_TEMPLATE must be a Twilio Content SID (HX…) when using the twilio driver.')
      process.exit(1)
    }
    pass('Twilio credentials are present.')
  }

  if (!recipient) {
    heading('Delivery')
    note('No recipient given, so nothing was sent.')
    note('Run again with a number to send a real code:')
    note('  npm run whatsapp:doctor -- +919876543210')
    console.log('')
    return
  }

  await sendTest(recipient)
}

/**
 * Proves the token and the phone number id belong together.
 *
 * These are the two values people mix up most: the phone number id is not the
 * phone number, and a token minted against the wrong app authenticates fine
 * while addressing a number it cannot use.
 */
async function checkMetaNumber(phoneNumberId: string, token: string, version: string) {
  heading('Meta credentials')

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`

  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12_000),
    })
    const json = (await response.json().catch(() => null)) as {
      display_phone_number?: string
      verified_name?: string
      quality_rating?: string
      code_verification_status?: string
      error?: { message?: string; code?: number; type?: string }
    } | null

    if (!response.ok) {
      fail(json?.error?.message ?? `HTTP ${response.status}`)

      // The three ways this goes wrong, and what each looks like.
      if (json?.error?.code === 190) {
        note('Code 190 means the access token is invalid or has expired.')
        note('A temporary token from the API Setup page lasts 24 hours — for a deployment you')
        note('need a permanent token from a System User in Business Settings.')
      } else if (json?.error?.code === 100) {
        note('Code 100 usually means WHATSAPP_PHONE_NUMBER_ID is wrong.')
        note('It is the long numeric "Phone number ID" on the API Setup page — not the phone')
        note('number itself, and not the WhatsApp Business Account ID.')
      } else if (json?.error?.code === 200) {
        note('Code 200 means the token lacks permission for this number.')
        note('The System User needs whatsapp_business_messaging, and must be assigned to the')
        note('WhatsApp Business Account with full control.')
      }
      process.exit(1)
    }

    pass(`Token and phone number id match: ${json?.display_phone_number ?? 'unknown number'}`)
    if (json?.verified_name) note(`display name: ${json.verified_name}`)
    if (json?.quality_rating) note(`quality rating: ${json.quality_rating}`)
    if (json?.code_verification_status && json.code_verification_status !== 'VERIFIED') {
      warn(`The number's verification status is ${json.code_verification_status}.`)
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
    note('Meta could not be reached at all — check outbound network access from this host.')
    process.exit(1)
  }
}

/**
 * Sends one real code through the same provider the reset flow uses.
 *
 * Deliberately the provider rather than a hand-rolled request: a test that
 * takes a different path can pass while the product still fails.
 */
async function sendTest(recipient: string) {
  heading('Delivery')

  const e = env()
  const code = String(Math.floor(100_000 + Math.random() * 900_000))
  const provider = whatsappProvider()

  console.log(`  provider            ${provider.name}`)
  console.log(`  to                  ${recipient}`)
  console.log(`  code                ${code}`)
  console.log('')

  const result = await provider.send({
    to: recipient,
    templateName: e.WHATSAPP_OTP_TEMPLATE,
    body: `${code} is your password reset code.`,
    variables: { '1': code },
  })

  if (result.ok) {
    pass(`Accepted by ${provider.name}${result.providerMessageId ? ` — id ${result.providerMessageId}` : ''}`)
    note('Accepted means Meta took the message, not that it was delivered. If it does not')
    note('arrive: check WhatsApp is installed on that number, and that the number is on the')
    note("app's recipient list while the app is still unpublished.")
    console.log('')
    return
  }

  fail(result.error ?? 'Unknown error')

  const detail = (result.error ?? '').toLowerCase()
  if (detail.includes('template') && detail.includes('exist')) {
    note(`No approved template called "${e.WHATSAPP_OTP_TEMPLATE}" in language`)
    note(`"${e.WHATSAPP_OTP_TEMPLATE_LANG}". The name, the language and the category all have`)
    note('to match. Create it under WhatsApp Manager ? Message templates.')
  } else if (detail.includes('parameter') || detail.includes('component')) {
    note('The template exists but its shape does not match what is being sent.')
    note(`This app sends one body parameter {{1}} and${e.WHATSAPP_OTP_COPY_BUTTON ? '' : ' no'} copy-code button.`)
    note(
      e.WHATSAPP_OTP_COPY_BUTTON
        ? 'If your template has no copy-code button, set WHATSAPP_OTP_COPY_BUTTON=false.'
        : 'If your template has a copy-code button, set WHATSAPP_OTP_COPY_BUTTON=true.',
    )
  } else if (detail.includes('recipient') || detail.includes('not in allowed')) {
    note('While the app is unpublished, only numbers added to its recipient list can be')
    note('messaged. Add this number under API Setup ? "To".')
  }

  console.log('')
  process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
