---
name: run-mycampusview
description: Build, launch, screenshot and smoke-test the MyCampusView school ERP (Next.js multi-tenant app + marketing site). Use when asked to run, start, serve, boot, screenshot, preview, verify or smoke-test this app, when a page renders wrong or unstyled, when the dev server or database will not start, or before/after changing dependencies. Covers Docker Postgres, the two hostnames, and the Windows file-lock traps that silently break CSS and Prisma.
---

# Run MyCampusView

Multi-tenant Next.js 15 app. One server answers three ways depending on the
**hostname**: the marketing site on the apex, a school's application on a
tenant subdomain, and a redirect on anything else. It needs Postgres running
before any page will render.

Drive it with the committed driver — do not hand-roll `npm run dev` and curl:

```bash
node .claude/skills/run-mycampusview/driver.mjs smoke
```

Paths below are relative to the repo root (the directory holding `package.json`).

## The three hostnames

| URL | Serves |
|---|---|
| `http://lvh.me:3000` | Marketing site |
| `http://demo.lvh.me:3000` | The "demo" school's application |
| `http://localhost:3000` | **Nothing useful** — 307s. Not a tenant, not the apex. |

`lvh.me` and `*.lvh.me` are public DNS names that resolve to `127.0.0.1`, so
no hosts-file entry is needed. Verified:

```bash
node -e "require('dns').lookup('demo.lvh.me',(e,a)=>console.log(a))"   # 127.0.0.1
```

Reaching for `localhost:3000` and getting
`PrismaClientInitializationError ... tenantDomain.findUnique` is the single
most common wrong turn. It is not a database bug; it is the wrong host.

## Prerequisites

- Docker Desktop (Postgres + Redis)
- Node 22 (`node -v` → v22.21.0 here)
- Chrome or Edge, for screenshots. Auto-detected; skipped if absent.

```bash
npm ci
npx prisma generate          # npm ci wipes the generated client — always re-run
docker compose up -d postgres redis
npx prisma migrate deploy
npm run db:seed              # creates the demo + greenwood tenants
```

## Run (agent path)

```bash
node .claude/skills/run-mycampusview/driver.mjs doctor   # env, DB, stale procs
node .claude/skills/run-mycampusview/driver.mjs up       # start dev server
node .claude/skills/run-mycampusview/driver.mjs up --clean   # + wipe .next first
node .claude/skills/run-mycampusview/driver.mjs probe    # assert pages AND css
node .claude/skills/run-mycampusview/driver.mjs shot     # headless screenshots
node .claude/skills/run-mycampusview/driver.mjs smoke    # all of the above
node .claude/skills/run-mycampusview/driver.mjs down     # stop dev server
```

Exit code 0 = PASS, 1 = FAIL. Screenshots land in
`.claude/skills/run-mycampusview/shots/{marketing,tenant}.png` — **open them.**

`up` starts Docker Desktop if it is down, waits for `pg_isready`, kills stale
node processes, optionally clears `.next`, then launches `next dev` detached
and waits for port 3000.

**Use `--clean` after any dependency change.** Next's dev cache keys vendor
chunks per-dependency and does not invalidate them when `node_modules` moves
underneath it; a stale cache serves `Cannot find module './vendor-chunks/…'`.

### Why `probe` fetches the CSS

A page here can return **HTTP 200 with every word of its copy present and
still be completely unstyled**, because Next references its stylesheets by URL
and those files can silently fail to be written. `probe` therefore parses the
`<link>` hrefs out of the HTML and fetches each one, failing if any 404s or
comes back under 1 KB. Checking status codes and page text alone will pass a
broken page. This actually happened.

## Run (human path)

```bash
docker compose up -d postgres redis
npm run dev
```

Then open `http://lvh.me:3000`. Stop with Ctrl-C — but note Ctrl-C often
leaves orphaned node processes on Windows (see Gotchas), so prefer
`driver.mjs down`.

Seeded logins (password `Password@123` for all): `admin@demo.schoolos.dev`,
`teacher@demo.schoolos.dev`, `parent@demo.schoolos.dev`.

## Test

```bash
npx vitest run          # 453 tests, needs Postgres up AND seeded
npx tsc --noEmit
npm run build           # stop the dev server first — see Gotchas
```

Tests hit the real seeded database. `beforeAll` throws
`Seed the database first` if `demo`/`greenwood` tenants are missing.

## Gotchas

**`pkill` does nothing on Windows.** `pkill -f "next dev"` exits 0 and kills
nothing, so orphaned dev servers accumulate silently. Use:

```bash
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*School ERP*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }"
```

`driver.mjs down` does exactly this. Orphans are not cosmetic — see the next two.

**Orphaned node holds `lightningcss` and Tailwind silently emits nothing.**
Tailwind v4 uses `lightningcss-win32-x64-msvc.node`. If a stale process holds
it, Next creates an empty `.next/static/css/` and every stylesheet 404s while
pages still return 200. Symptom: unstyled page, native-looking buttons, blue
underlined links. `npm ci` surfaces the same lock as
`EPERM: unlink … lightningcss.win32-x64-msvc.node`. Fix: kill everything, then
`npm ci && npx prisma generate`, then `up --clean`.

**A running dev server breaks `npm run build`.** It holds
`node_modules/.prisma/client/query_engine-windows.dll.node`, so the
`prisma generate` step fails with `EPERM: operation not permitted, rename`.
Always `driver.mjs down` before building.

**Docker Desktop stops on its own.** Repeatedly, in practice. Every page 500s
with `Can't reach database server at localhost:5433`. `doctor` reports it;
`up` restarts Docker and waits.

**`.env` can drift from `docker-compose.yml`.** They disagreed once
(`schoolos:schoolos` vs `mycampusview:mycampusview`), which reads as "database
down" when the container is fine. `doctor` asserts the credentials match.

**Tailwind v4 cascade layers.** `src/styles/site.css` sets
`.site h1, .site h2, .site h3 { color: var(--text) }` *unlayered*. Unlayered
CSS beats anything in `@layer utilities`, so a `text-[…]` utility on a heading
is ignored — headings must take colour by inheritance from their ground. This
made every heading on the dark marketing sections invisible.

**React Three Fiber breaks unrelated type checking.** Installing
`@react-three/fiber` augments the global JSX namespace and makes `className`
resolve to `never` on dynamically-assigned components, producing
`Type 'string' is not assignable to type 'never'` in files you did not touch
(`shell/topbar.tsx`, `shell/notification-menu.tsx`). The marketing hero uses
plain `three` directly for this reason. Do not reintroduce R3F.

**Screenshots need WebGL flags.** The marketing hero is a WebGL canvas;
headless Chrome renders an empty black ground without
`--enable-unsafe-swiftshader`, and captures the pre-animation state without
`--virtual-time-budget`. The driver passes both.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `PrismaClientInitializationError` at `tenant.ts` `tenantDomain.findUnique` | Browsing `localhost:3000`, or Postgres down. Use `lvh.me:3000`; run `doctor`. |
| Page loads but is completely unstyled | Stale node holding lightningcss. Kill all, `npm ci`, `npx prisma generate`, `up --clean`. |
| `Cannot find module './vendor-chunks/lenis.js'` | Stale `.next` after a dependency change. `up --clean`. |
| `EPERM … query_engine-windows.dll.node` during build | Dev server running. `driver.mjs down` first. |
| `EPERM … lightningcss…node` during `npm ci` | Orphaned node. Kill via PowerShell above, retry. |
| `@prisma/client did not initialize yet` | Ran `npm ci`. `npx prisma generate`. |
| `spawn EINVAL` spawning npm | Node 22 will not spawn `.cmd` without a shell. Driver invokes `node node_modules/next/dist/bin/next dev` instead. |
| Tests: `Seed the database first` | `npm run db:seed`. |
| Port 3000 taken, dev moves to 3001 | An orphan owns 3000. `driver.mjs down`, relaunch. |

## Cascade traps this app is prone to

`src/styles/site.css` is loaded **unlayered**, and Tailwind v4 emits utilities
into `@layer utilities`. Unlayered CSS wins, so any bare class in that file
silently overrides the matching utility. Three separate bugs came from this:

- `.site h1,h2,h3 { color }` beat `text-[…]`, making every heading on the dark
  sections invisible. Fixed by having `.ed-display` inherit from its ground.
- `.site .ed-line { display: block }` beat `inline-block`, setting every word
  of the hero headline on its own line. Fixed with a separate `.ed-word` class.

Before adding a utility to an element that `site.css` also targets by class,
check that file first — the utility may never apply.
