/**
 * Cross-platform k6 runner via Docker.
 * Usage: npx tsx scripts/run-k6.ts smoke|soak
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const kind = process.argv[2] === 'soak' ? 'soak' : 'smoke'
const root = path.resolve(__dirname, '..')
const script = path.join(root, 'load', `k6-${kind}.js`)
const baseUrl = process.env.BASE_URL ?? 'http://host.docker.internal:3000'

if (!fs.existsSync(script)) {
  console.error(`Missing ${script}`)
  process.exit(1)
}

const input = fs.readFileSync(script)
const result = spawnSync(
  'docker',
  ['run', '--rm', '-i', '-e', `BASE_URL=${baseUrl}`, 'grafana/k6', 'run', '-'],
  { input, stdio: ['pipe', 'inherit', 'inherit'], cwd: root, env: process.env },
)

if (result.error) {
  console.error(
    'Docker/k6 failed. Install Docker Desktop, or run:\n' +
      `  docker run --rm -i -e BASE_URL=${baseUrl} grafana/k6 run - < load/k6-${kind}.js`,
  )
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
