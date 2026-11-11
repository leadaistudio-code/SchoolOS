/**
 * Writes the Robotics 101 reference sketches to arduino/robotics-101/ and,
 * with --compile, builds each one for the Arduino Uno with arduino-cli.
 *
 *   npx tsx scripts/robotics101-sketches.ts --compile
 *
 * arduino-cli is found on PATH or at ARDUINO_CLI. It needs the AVR core:
 *   arduino-cli core install arduino:avr
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { SKETCHES } from '../src/lib/lms/robotics101-sketches'

const root = path.resolve('arduino/robotics-101')
const compile = process.argv.includes('--compile')
const cli = process.env.ARDUINO_CLI || 'arduino-cli'

for (const sketch of SKETCHES) {
  const dir = path.join(root, sketch.name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${sketch.name}.ino`), sketch.code)
  console.log(`wrote  ${sketch.name}.ino`)
}

if (compile) {
  const results: string[] = []
  let failed = 0
  for (const sketch of SKETCHES) {
    const dir = path.join(root, sketch.name)
    try {
      const out = execFileSync(cli, ['compile', '--fqbn', 'arduino:avr:uno', dir], { encoding: 'utf8' })
      const size = out.match(/Sketch uses (\d+) bytes/)?.[1]
      results.push(`ok     ${sketch.name} (${size ?? '?'} bytes of program storage)`)
    } catch (e) {
      failed++
      const err = e as { stderr?: string; stdout?: string; message: string }
      results.push(`FAILED ${sketch.name}\n${err.stderr || err.stdout || err.message}`)
    }
  }
  console.log(results.join('\n'))
  const report = path.join(root, 'COMPILE-REPORT.txt')
  const version = existsSync(cli) || cli === 'arduino-cli' ? safe(() => execFileSync(cli, ['version'], { encoding: 'utf8' }).trim()) : ''
  writeFileSync(report, [`Board: arduino:avr:uno`, version, `Date: ${new Date().toISOString()}`, '', ...results, ''].join('\n'))
  if (failed) process.exit(1)
}

function safe(fn: () => string) {
  try {
    return fn()
  } catch {
    return ''
  }
}
