import 'dotenv/config'
import nodemailer from 'nodemailer'
import { CONTACT } from '../src/content/site/company'
import { composeDemoEmail } from '../src/server/modules/site/demo'
import { smtpOptionsFrom } from '../src/server/providers'

/**
 * Will a demo request from the website actually reach the inbox?
 *
 *   npm run mail:doctor                 send to SALES_INBOX (or the published address)
 *   npm run mail:doctor -- you@x.com    send somewhere else
 *
 * The website form stores every enquiry in the database first, so a broken
 * mailbox loses nothing — but it does mean nobody finds out until someone goes
 * looking. This reports the configuration, opens the connection, authenticates,
 * and sends one real enquiry email so the whole path is proved end to end.
 *
 * Run it wherever the question is being asked. Inside Railway:
 *
 *   railway ssh --service <web service>
 *   npm run mail:doctor
 */

/** A plausible enquiry, so what lands in the inbox is what a lead looks like. */
const SAMPLE = {
  name: 'Test enquiry',
  email: 'test@example.com',
  phone: '+91 90000 00000',
  school: 'Test School',
  city: 'Pune',
  country: 'India',
  schoolType: 'PRIVATE_SCHOOL',
  size: '300_1000',
  interest: 'EVERYTHING',
  contactPreference: 'PHONE',
  message:
    'This is a test message from `npm run mail:doctor`. If it is in your inbox, the website form will reach you too.',
  consent: true,
} as const

function describeUrl(url: string): string {
  try {
    const { protocol, hostname, port, username, password } = new URL(url)
    const implicit = protocol === 'smtps:'
    return (
      `${hostname}:${port || (implicit ? '465' : '587')} ` +
      `(${implicit ? 'implicit TLS' : 'STARTTLS'}) ` +
      `as ${username ? decodeURIComponent(username) : '(no username)'} ` +
      `${password ? `with a ${password.length}-character password` : 'with NO password'}`
    )
  } catch {
    return 'SMTP_URL is not a valid URL'
  }
}

async function main() {
  const problems: string[] = []

  const driver = process.env.EMAIL_DRIVER ?? 'log'
  const url = process.env.SMTP_URL
  const from = process.env.EMAIL_FROM ?? 'MyCampusView <no-reply@example.com>'
  const to = process.argv[2] ?? process.env.SALES_INBOX ?? CONTACT.sales

  console.log('1. Configuration')
  console.log(`   EMAIL_DRIVER ${driver}`)
  console.log(`   SMTP_URL     ${url ? describeUrl(url) : 'NOT SET'}`)
  console.log(`   EMAIL_FROM   ${from}`)
  console.log(`   sending to   ${to}${process.argv[2] ? ' (from the command line)' : ''}`)

  if (driver === 'log') {
    problems.push(
      'EMAIL_DRIVER is "log", so enquiries are written to the log and never sent.\n' +
        '     Set EMAIL_DRIVER=smtp on this deployment and redeploy.',
    )
  }
  if (!url) {
    problems.push(
      'SMTP_URL is not set. For a Hostinger mailbox:\n' +
        '     smtps://contact%40mycampusview.com:PASSWORD@smtp.hostinger.com:465\n' +
        '     Percent-encode @ / + in the username and password (@ = %40, / = %2F, + = %2B).',
    )
  }
  if (from.includes('example.com')) {
    problems.push(
      'EMAIL_FROM is still the placeholder. It must be the mailbox you authenticate as,\n' +
        '     or an alias of it — Hostinger rejects a From address it does not own.\n' +
        '     EMAIL_FROM="MyCampusView <contact@mycampusview.com>"',
    )
  }

  if (problems.length > 0 || !url) {
    report(problems)
    process.exitCode = 1
    return
  }

  /* -------------------------------------------- 2. the connection -------- */
  const transport = nodemailer.createTransport(smtpOptionsFrom(url))

  console.log('\n2. Connection')
  try {
    await transport.verify()
    console.log('   connected and authenticated')
  } catch (error) {
    console.log(`   FAILED — ${message(error)}`)
    report([advise(error)])
    process.exitCode = 1
    return
  }

  /* -------------------------------------------------- 3. the send -------- */
  const email = composeDemoEmail(SAMPLE, { ip: null, userAgent: null, referer: null })

  console.log('\n3. Sending the enquiry')
  console.log(`   subject      ${email.subject}`)
  try {
    const info = await transport.sendMail({ from, to, replyTo: SAMPLE.email, ...email })
    console.log(`   accepted     ${info.messageId}`)
    console.log(`\nSent. Check ${to} — including the spam folder the first time.`)
    console.log('If it is in spam, add SPF and DKIM records for the sending domain.')
  } catch (error) {
    console.log(`   FAILED — ${message(error)}`)
    report([advise(error)])
    process.exitCode = 1
  } finally {
    transport.close()
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Turns a mail library error into the thing to go and change. */
function advise(error: unknown): string {
  const code = (error as { code?: string })?.code
  const raw = message(error)

  if (code === 'EAUTH') {
    return (
      'The server rejected the username or password.\n' +
      '     Hostinger wants the full address as the username (contact@mycampusview.com)\n' +
      '     and the mailbox password, not your Hostinger account password.\n' +
      '     Percent-encode @ / + in the SMTP_URL (@ = %40, / = %2F, + = %2B).'
    )
  }
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ESOCKET') {
    return (
      'The connection did not open.\n' +
      '     Use smtps://…:465 for implicit TLS or smtp://…:587 for STARTTLS.\n' +
      '     Some hosts block outbound 465 — try 587 before assuming the credentials are wrong.'
    )
  }
  if (raw.includes('getaddrinfo')) return 'That server address could not be found. Check the hostname.'
  if (code === 'EENVELOPE' || raw.includes('550') || raw.includes('553')) {
    return (
      'The server refused the envelope.\n' +
      '     EMAIL_FROM must be the mailbox you authenticated as, or an alias of it.'
    )
  }
  return raw
}

function report(problems: string[]) {
  console.log('\nTo fix:')
  for (const problem of problems) console.log(`   - ${problem}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
