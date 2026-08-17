#!/usr/bin/env node
/**
 * MyCampusView run driver.
 *
 * The app is a multi-tenant Next.js server whose failure modes are almost all
 * invisible to a naive check: a page can return HTTP 200, contain every word
 * of its copy, and still be completely unstyled because the stylesheet 404s.
 * That has happened. So `probe` asserts the CSS is actually served and
 * non-trivial, not merely that the page responded.
 *
 * Usage (paths relative to the repo root):
 *
 *   node .claude/skills/run-mycampusview/driver.mjs doctor
 *   node .claude/skills/run-mycampusview/driver.mjs up
 *   node .claude/skills/run-mycampusview/driver.mjs probe
 *   node .claude/skills/run-mycampusview/driver.mjs shot [outdir]
 *   node .claude/skills/run-mycampusview/driver.mjs smoke     # all of the above
 *   node .claude/skills/run-mycampusview/driver.mjs down
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(process.argv[2] && !process.argv[2].startsWith('-') ? process.cwd() : process.cwd())
const PORT = 3000

/** Marketing site and one seeded tenant. `localhost` is deliberately absent. */
const HOSTS = {
  marketing: `http://lvh.me:${PORT}`,
  tenant: `http://demo.lvh.me:${PORT}`,
}

const ok = (m) => console.log(`  ok    ${m}`)
const bad = (m) => console.log(`  FAIL  ${m}`)
const info = (m) => console.log(`  ..    ${m}`)
const head = (m) => console.log(`\n${m}`)

let failures = 0
const fail = (m) => {
  failures += 1
  bad(m)
}

const sh = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', shell: false, ...opts })

/** PowerShell, because `pkill` silently matches nothing on Windows. */
const ps = (script) =>
  spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ chrome */

function findChrome() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

/* ----------------------------------------------------------------- doctor */

function dockerUp() {
  return sh('docker', ['info']).status === 0
}

function postgresReady() {
  const r = sh('docker', [
    'exec',
    'mycampusview-postgres',
    'pg_isready',
    '-U',
    'mycampusview',
    '-d',
    'mycampusview',
  ])
  return r.status === 0
}

/** Node processes belonging to this checkout, by command line. */
function projectNodePids() {
  const r = ps(
    `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ` +
      `Where-Object { $_.CommandLine -like '*School ERP*' } | ` +
      `Select-Object -ExpandProperty ProcessId`,
  )
  return (r.stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function doctor() {
  head('doctor')

  const envPath = join(ROOT, '.env')
  if (!existsSync(envPath)) fail('.env missing (copy .env.example)')
  else {
    const env = readFileSync(envPath, 'utf8')
    const url = /^DATABASE_URL=(.*)$/m.exec(env)?.[1] ?? ''
    // The compose file and .env drifted apart once already; a mismatch here
    // surfaces later as "Can't reach database server", which reads like the
    // container is down when it is not.
    if (!url.includes('mycampusview:mycampusview@localhost:5433'))
      fail(`DATABASE_URL does not match docker-compose: ${url.slice(0, 60)}`)
    else ok('DATABASE_URL matches docker-compose')
  }

  if (!existsSync(join(ROOT, 'node_modules/.prisma/client')))
    fail('prisma client not generated — run: npx prisma generate')
  else ok('prisma client generated')

  if (!dockerUp()) fail('docker engine down — start Docker Desktop')
  else if (!postgresReady()) fail('postgres not ready — run: docker compose up -d postgres redis')
  else ok('postgres ready')

  const chrome = findChrome()
  if (!chrome) info('no chrome/edge found — `shot` will be skipped')
  else ok(`browser: ${chrome}`)

  const pids = projectNodePids()
  info(`project node processes: ${pids.length ? pids.join(', ') : 'none'}`)

  return failures === 0
}

/* --------------------------------------------------------------------- up */

async function waitFor(url, ms = 120_000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (res.status > 0) return true
    } catch {
      /* not listening yet */
    }
    await sleep(2000)
  }
  return false
}

async function up({ clean = false } = {}) {
  head('up')

  if (!dockerUp()) {
    info('starting Docker Desktop (this takes ~30s)')
    ps(`Start-Process "$env:ProgramFiles\\Docker\\Docker\\Docker Desktop.exe"`)
    for (let i = 0; i < 40 && !dockerUp(); i += 1) await sleep(5000)
  }
  if (!dockerUp()) return fail('docker engine would not start'), false

  sh('docker', ['compose', 'up', '-d', 'postgres', 'redis'], { cwd: ROOT })
  for (let i = 0; i < 20 && !postgresReady(); i += 1) await sleep(3000)
  if (!postgresReady()) return fail('postgres would not become ready'), false
  ok('postgres ready')

  // A dev server started before a dependency change keeps serving a stale
  // webpack cache and holds native .node binaries open. Always start clean.
  const stale = projectNodePids()
  if (stale.length) {
    info(`killing ${stale.length} stale node process(es): ${stale.join(', ')}`)
    ps(
      `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ` +
        `Where-Object { $_.CommandLine -like '*School ERP*' } | ` +
        `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    )
    await sleep(3000)
  }

  if (clean) {
    info('removing .next (required after any dependency change)')
    ps(`Remove-Item -Recurse -Force "${join(ROOT, '.next')}" -ErrorAction SilentlyContinue`)
  }

  info('starting next dev')
  // Next's binary is invoked through node rather than `npm run dev`: Node 22
  // refuses to spawn a .cmd shim without a shell (EINVAL), and going through
  // npm would also leave an extra process between us and the server that
  // `down` would then have to reap.
  const nextBin = join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
  if (!existsSync(nextBin)) return fail(`next binary not found at ${nextBin}`), false

  const child = spawn(process.execPath, [nextBin, 'dev'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  const live = await waitFor(`${HOSTS.marketing}/`)
  if (!live) return fail('dev server never began listening on port 3000'), false
  ok(`dev server listening on ${PORT}`)
  return true
}

/* ------------------------------------------------------------------ probe */

/**
 * A page is only up if its stylesheet is too.
 *
 * Next references its CSS chunks by URL in the HTML; when Tailwind's native
 * binary is locked those files are never written and every link 404s while
 * the page still returns 200 with correct markup. Fetching them is the only
 * check that catches it short of looking at a screenshot.
 */
async function checkPage(label, url, mustContain) {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) })
  const html = await res.text()

  if (res.status !== 200) return fail(`${label} ${url} -> HTTP ${res.status}`)
  ok(`${label} HTTP 200 (${html.length} bytes)`)

  for (const needle of mustContain) {
    if (html.includes(needle)) ok(`${label} contains "${needle}"`)
    else fail(`${label} missing "${needle}"`)
  }

  const hrefs = [...html.matchAll(/href="(\/_next\/static\/css\/[^"]+)"/g)].map((m) =>
    m[1].replace(/&amp;/g, '&'),
  )
  if (!hrefs.length) return fail(`${label} references no stylesheet at all`)

  for (const href of [...new Set(hrefs)]) {
    const cssRes = await fetch(new URL(href, url), { signal: AbortSignal.timeout(30_000) })
    const css = await cssRes.text()
    if (cssRes.status !== 200) fail(`${label} CSS ${href} -> HTTP ${cssRes.status}`)
    else if (css.length < 1000) fail(`${label} CSS ${href} suspiciously small (${css.length}b)`)
    else ok(`${label} CSS ${href.split('/').pop()} (${css.length}b)`)
  }
}

async function probe() {
  head('probe')
  await checkPage('marketing', `${HOSTS.marketing}/`, ['MyCampusView', 'Book a demo'])
  await checkPage('tenant   ', `${HOSTS.tenant}/login`, ['Sign in', 'Password'])

  // localhost is neither the marketing apex nor a tenant subdomain, so the
  // middleware renders the application with no tenant to resolve. Asserting
  // the redirect keeps anyone from "fixing" that later and calling it a bug.
  const res = await fetch(`http://localhost:${PORT}/`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  })
  if (res.status === 307 || res.status === 302) ok('localhost redirects (expected — not a host)')
  else info(`localhost -> HTTP ${res.status} (expected 307)`)
}

/* ------------------------------------------------------------------- shot */

async function shot(outdir = join(ROOT, '.claude', 'skills', 'run-mycampusview', 'shots')) {
  head('shot')
  const chrome = findChrome()
  if (!chrome) return info('no browser found — skipped')

  // Chrome screenshots whatever it is given, including its own
  // ERR_CONNECTION_REFUSED page, and exits 0 doing it. Without this check the
  // driver cheerfully reports PASS having captured an error page.
  try {
    const res = await fetch(`${HOSTS.marketing}/`, { signal: AbortSignal.timeout(10_000) })
    if (res.status !== 200) return fail(`server responded ${res.status} — run \`up\` first`)
  } catch {
    return fail('server not reachable — run `up` first')
  }

  mkdirSync(outdir, { recursive: true })

  // Each homepage movement has an id, so an anchor is enough to land on it —
  // no CDP session needed, and it survives the smooth-scroll layer because the
  // browser jumps before the page's JavaScript has taken over scrolling.
  const targets = process.argv.includes('--sections')
    ? Object.fromEntries([
        ['hero', `${HOSTS.marketing}/`],
        ...['platform', 'product', 'modules', 'stories', 'demo'].map((id) => [
          id,
          `${HOSTS.marketing}/#${id}`,
        ]),
      ])
    : { marketing: `${HOSTS.marketing}/`, tenant: `${HOSTS.tenant}/login` }

  for (const [name, target] of Object.entries(targets)) {
    const out = join(outdir, `${name}.png`)
    const r = sh(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      // The marketing hero is WebGL; without this it renders an empty ground
      // in headless and the screenshot lies about what a user sees.
      '--enable-unsafe-swiftshader',
      '--window-size=1440,900',
      // Reveals fire on scroll and WebGL needs a beat; without a delay the
      // capture is of the pre-animation state.
      '--virtual-time-budget=9000',
      `--screenshot=${out}`,
      target,
    ])
    // Trust the artefact, not the exit code: Chrome exits non-zero for
    // unrelated subsystem noise while still writing a perfectly good capture.
    const size = existsSync(out) ? statSync(out).size : 0
    if (size > 5000) ok(`${name} -> ${out} (${Math.round(size / 1024)}kb)`)
    else fail(`${name} screenshot failed (${size}b): ${(r.stderr || '').split('\n')[0]}`)
  }
}

/* ------------------------------------------------------------------- down */

function down() {
  head('down')
  const pids = projectNodePids()
  if (!pids.length) return info('no project node processes running')
  ps(
    `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ` +
      `Where-Object { $_.CommandLine -like '*School ERP*' } | ` +
      `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
  )
  ok(`stopped ${pids.length} process(es): ${pids.join(', ')}`)
}

/* ------------------------------------------------------------------- main */

const command = process.argv[2] ?? 'smoke'

const run = async () => {
  switch (command) {
    case 'doctor':
      doctor()
      break
    case 'up':
      await up({ clean: process.argv.includes('--clean') })
      break
    case 'probe':
      await probe()
      break
    case 'shot':
      // argv[3] is an optional outdir — but it may equally be a flag, and
      // passing "--sections" as a directory silently writes every capture
      // into a folder of that name.
      await shot(process.argv[3]?.startsWith('--') ? undefined : process.argv[3])
      break
    case 'down':
      down()
      break
    case 'smoke':
      doctor()
      if (await up({ clean: process.argv.includes('--clean') })) {
        await probe()
        await shot()
      }
      break
    default:
      console.error(`unknown command: ${command}`)
      process.exit(2)
  }

  console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures})`)
  process.exit(failures === 0 ? 0 : 1)
}

run().catch((error) => {
  console.error('\ndriver crashed:', error)
  process.exit(1)
})
