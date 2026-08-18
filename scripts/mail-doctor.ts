import 'dotenv/config'
import net from 'node:net'
import dns from 'node:dns/promises'
import nodemailer from 'nodemailer'
import { CONTACT } from '../src/content/site/company'
import { composeDemoEmail } from '../src/server/modules/site/demo'
import { emailProvider, smtpOptionsFrom } from '../src/server/providers'

/**
 * Will a demo request from the website actually reach the inbox?
 *
 *   npm run mail:doctor                 send to SALES_INBOX (or the published address)
 *   npm run mail:doctor -- you@x.com    send somewhere else
 *
 * The website form stores every enquiry in the database first, so a broken
 * mailbox loses nothing — but it does mean nobody finds out until someone goes
 * looking. This reports the configuration, proves the mail server is reachable
 * at all, authenticates, and sends one real enquiry email, so the whole path is
 * checked end to end and a failure names the step that broke.
 *
 * Both routes are covered: an HTTPS API when EMAIL_DRIVER=resend and a key is
 * set, SMTP otherwise. The reachability step exists because most hosts block
 * outbound SMTP, and from inside a mail library that is indistinguishable from
 * a wrong hostname or a bad password.
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
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM ?? 'MyCampusView <no-reply@example.com>'
  const to = process.argv[2] ?? process.env.SALES_INBOX ?? CONTACT.sales
  const overHttps = driver === 'resend' && Boolean(apiKey)

  console.log('1. Configuration')
  console.log(`   EMAIL_DRIVER ${driver}`)
  if (driver === 'resend') {
    console.log(`   RESEND_API_KEY ${apiKey ? `set (${apiKey.length} chars)` : 'NOT SET'}`)
  }
  if (!overHttps) console.log(`   SMTP_URL     ${url ? describeUrl(url) : 'NOT SET'}`)
  console.log(`   EMAIL_FROM   ${from}`)
  console.log(`   sending to   ${to}${process.argv[2] ? ' (from the command line)' : ''}`)
  console.log(`   route        ${overHttps ? 'HTTPS API (not affected by SMTP blocks)' : 'SMTP'}`)

  if (driver === 'log') {
    problems.push(
      'EMAIL_DRIVER is "log", so enquiries are written to the log and never sent.\n' +
        '     Set EMAIL_DRIVER=resend (with RESEND_API_KEY) or smtp (with SMTP_URL).',
    )
  }
  if (driver === 'resend' && !apiKey && !url) {
    problems.push(
      'EMAIL_DRIVER is "resend" but RESEND_API_KEY is not set.\n' +
        '     Create a key at resend.com/api-keys and set it on this deployment.',
    )
  }
  if (driver !== 'log' && driver !== 'resend' && !url) {
    problems.push(
      'SMTP_URL is not set. For a Hostinger mailbox:\n' +
        '     smtps://contact%40mycampusview.com:PASSWORD@smtp.hostinger.com:465\n' +
        '     Percent-encode @ / + in the username and password (@ = %40, / = %2F, + = %2B).',
    )
  }
  if (from.includes('example.com')) {
    problems.push(
      'EMAIL_FROM is still the placeholder. It must be an address on a domain you have\n' +
        '     verified with the provider — Resend and Hostinger both reject a From they\n' +
        '     do not own. EMAIL_FROM="MyCampusView <contact@mycampusview.com>"',
    )
  }

  if (problems.length > 0) {
    report(problems)
    process.exitCode = 1
    return
  }

  /* ------------------------------------------- the HTTPS route ----------- */
  //
  // Nothing to diagnose about a connection here: it is an ordinary HTTPS
  // request, and the provider says plainly why it refused one.
  if (overHttps) {
    console.log('\n2. Sending the enquiry')
    const email = composeDemoEmail(SAMPLE, { ip: null, userAgent: null, referer: null })
    console.log(`   subject      ${email.subject}`)

    const result = await emailProvider().send({ to, replyTo: SAMPLE.email, ...email })
    if (result.ok) {
      console.log(`   accepted     ${result.providerMessageId}`)
      console.log(`\nSent. Check ${to} — including the spam folder the first time.`)
      console.log('If it is in spam, add the SPF and DKIM records the provider gives you.')
      return
    }

    console.log(`   FAILED — ${result.error}`)
    report([adviseApi(result.error ?? '', from)])
    process.exitCode = 1
    return
  }

  if (!url) {
    report(['SMTP_URL is not set and there is no API key to fall back on.'])
    process.exitCode = 1
    return
  }

  /* ------------------------------------------- 2. the network ------------ */
  //
  // Worth doing before nodemailer, because the three ways this fails look
  // identical from inside the mail library. A timeout is reported the same
  // whether the hostname is wrong, the mailbox is down, or the host this is
  // running on drops outbound mail traffic — and the last one is far and away
  // the most common, since most platforms block SMTP to stop their addresses
  // being used for spam. Proving it takes one socket.
  const { host, port } = smtpOptionsFrom(url)

  console.log('\n2. Reachability')

  let address: string
  try {
    const resolved = await dns.lookup(host)
    address = resolved.address
    console.log(`   DNS          ${host} is ${address}`)
  } catch {
    console.log(`   DNS          ${host} DOES NOT RESOLVE`)
    report(['That server address could not be found. Check the hostname in SMTP_URL.'])
    process.exitCode = 1
    return
  }

  // 443 on the same server is the control. If it opens, the network is fine
  // and the internet is reachable, which leaves the mail ports themselves.
  const control = await reachable(host, 443)
  const ports = [port, ...[465, 587, 2525].filter((p) => p !== port)]
  const results: { port: number; open: boolean; ms: number }[] = []

  for (const candidate of ports) {
    const outcome = await reachable(host, candidate)
    results.push({ port: candidate, ...outcome })
    console.log(
      `   port ${String(candidate).padEnd(8)}${outcome.open ? `open (${outcome.ms}ms)` : 'no reply — the packets are being dropped'}` +
        (candidate === port ? '   <- the one in SMTP_URL' : ''),
    )
  }

  const anyOpen = results.some((r) => r.open)
  if (!anyOpen) {
    console.log(`   port 443     ${control.open ? `open (${control.ms}ms)` : 'no reply'}`)

    report([
      control.open
        ? 'This host lets you reach the internet but blocks outbound mail.\n' +
          '     443 opens to the same server and every mail port is dropped, so the\n' +
          '     credentials have never been tried — nothing about SMTP_URL will fix it.\n' +
          '\n' +
          '     Railway blocks 25, 465, 587 and 2525 on Free, Trial and Hobby, and\n' +
          '     offers them on Pro and above. Most other platforms block at least 25.\n' +
          '\n' +
          '     Two ways out:\n' +
          '       - Send over HTTPS instead, which is never blocked. Any transactional\n' +
          '         provider with an API will do; the mail still arrives in the\n' +
          '         Hostinger mailbox, it just is not sent from it.\n' +
          '       - Or move to a plan where the platform permits SMTP.'
        : 'Nothing on this server is reachable from here, mail ports or otherwise.\n' +
          '     Check that the container has outbound network access at all.',
    ])
    process.exitCode = 1
    return
  }

  const chosen = results.find((r) => r.port === port)
  if (!chosen?.open) {
    const open = results.filter((r) => r.open).map((r) => r.port)
    report([
      `Port ${port} is blocked, but ${open.join(' and ')} answered.\n` +
        `     Point SMTP_URL at one of those instead — ${
          open.includes(465) ? 'smtps://…:465 for implicit TLS' : 'smtp://…:587 for STARTTLS'
        }.`,
    ])
    process.exitCode = 1
    return
  }

  /* -------------------------------------------- 3. the connection -------- */
  const transport = nodemailer.createTransport(smtpOptionsFrom(url))

  console.log('\n3. Connection')
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

  console.log('\n4. Sending the enquiry')
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

/**
 * Can a TCP connection be opened at all?
 *
 * Six seconds is generous for a socket that is going to open and pointless for
 * one that is being dropped, and there are four of these to try.
 */
function reachable(host: string, port: number): Promise<{ open: boolean; ms: number }> {
  return new Promise((resolve) => {
    const started = Date.now()
    const socket = new net.Socket()
    const done = (open: boolean) => {
      socket.destroy()
      resolve({ open, ms: Date.now() - started })
    }

    socket.setTimeout(6_000)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, host)
  })
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The same, for what the HTTPS API says when it refuses. */
function adviseApi(error: string, from: string): string {
  const lower = error.toLowerCase()

  if (lower.includes('api key') || lower.includes('unauthor') || lower.includes('401')) {
    return (
      'The provider rejected the API key.\n' +
      '     Check RESEND_API_KEY is set on THIS deployment and has not been revoked.'
    )
  }
  if (lower.includes('domain') || lower.includes('not verified') || lower.includes('403')) {
    const domain = from.match(/@([^\s>]+)/)?.[1] ?? 'your domain'
    return (
      `The sending domain is not verified, so ${domain} may not be sent from yet.\n` +
      '     Add the DNS records the provider shows you — for a domain whose DNS is at\n' +
      '     Hostinger, that is hPanel → Domains → DNS Zone Editor — then verify.\n' +
      '     To prove the wiring before DNS propagates, set EMAIL_FROM to the address\n' +
      '     the provider lends you for testing.'
    )
  }
  if (lower.includes('timeout') || lower.includes('fetch failed')) {
    return (
      'The request never got a reply.\n' +
      '     This route is plain HTTPS on 443, so an outbound block is unlikely —\n' +
      '     check the container has network access at all.'
    )
  }
  if (lower.includes('rate') || lower.includes('429')) {
    return 'The provider is rate limiting. Wait a moment and run it again.'
  }
  return error
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
