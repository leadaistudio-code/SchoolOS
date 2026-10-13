/**
 * Prepare MyCampusView brand assets for the Windows connector.
 *
 * - Removes solid black background → transparency
 * - Crops whitespace
 * - Builds square app icon from the magnifying-glass mark
 * - Writes multi-size icon.png + icon.ico for electron-builder / NSIS
 * - Writes logo-wide.png for the desktop GUI header
 */
const path = require('node:path')
const fs = require('node:fs')
const sharp = require('sharp')
const pngToIco = require('png-to-ico').default || require('png-to-ico')

const ROOT = path.join(__dirname, '..')
const BUILD = path.join(ROOT, 'build')
const GUI = path.join(ROOT, 'gui')

const SOURCE_CANDIDATES = [
  process.argv[2],
  path.join(BUILD, 'brand-logo.png'),
  path.join(BUILD, 'logo-source.png'),
  path.join(
    process.env.USERPROFILE || '',
    '.cursor',
    'projects',
    'c-Users-aryan-Desktop-Lead-AI-Studio-Project-School-ERP',
    'assets',
    'c__Users_aryan_AppData_Roaming_Cursor_User_workspaceStorage_812655201c86ab19c912017d39ab7a02_images_MyCampus__1_-083be8d3-372c-48b9-a2b6-c747e96fe478.png',
  ),
].filter(Boolean)

function findSource() {
  for (const candidate of SOURCE_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  throw new Error('Logo source PNG not found. Pass a path: node scripts/prepare-brand-assets.cjs <logo.png>')
}

/** Near-black → transparent; keep coloured logo pixels. */
async function removeBlackBackground(inputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const out = Buffer.from(data)
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i]
    const g = out[i + 1]
    const b = out[i + 2]
    // Treat near-black as background (logo never uses pure black fills in the mark)
    if (r <= 28 && g <= 28 && b <= 28) {
      out[i + 3] = 0
    }
  }

  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png()
}

async function trimTransparent(image) {
  return image.trim({ threshold: 0 }).png()
}

/**
 * Extract the circular mark (left side of the wide logo) into a square icon
 * with padding suitable for Windows taskbar / .exe.
 */
async function buildAppIcon(trimmedWidePngBuffer) {
  const meta = await sharp(trimmedWidePngBuffer).metadata()
  const w = meta.width || 1
  const h = meta.height || 1
  // Mark is roughly square on the left; take height × height, then slight inset.
  const side = Math.min(w, h)
  const extracted = await sharp(trimmedWidePngBuffer)
    .extract({ left: 0, top: 0, width: side, height: side })
    .png()
    .toBuffer()

  // Place on transparent square canvas with ~10% padding
  const canvas = 1024
  const pad = Math.round(canvas * 0.08)
  const inner = canvas - pad * 2
  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: await sharp(extracted).resize(inner, inner, { fit: 'contain' }).png().toBuffer(), left: pad, top: pad }])
    .png()
    .toBuffer()
}

async function writeSizes(iconBuffer, outDir) {
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
  const files = []
  for (const size of sizes) {
    const file = path.join(outDir, `icon-${size}.png`)
    await sharp(iconBuffer).resize(size, size).png().toFile(file)
    files.push(file)
  }
  return files
}

async function main() {
  fs.mkdirSync(BUILD, { recursive: true })
  fs.mkdirSync(GUI, { recursive: true })

  const source = findSource()
  console.log('Source:', source)

  // Keep a copy of the original in build for reference
  fs.copyFileSync(source, path.join(BUILD, 'logo-source.png'))

  const noBg = await removeBlackBackground(source)
  const trimmedBuf = await (await trimTransparent(noBg)).toBuffer()

  // Wide brand logo for GUI header (transparent)
  const logoWide = await sharp(trimmedBuf)
    .resize({ width: 900, height: 220, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
  await sharp(logoWide).toFile(path.join(BUILD, 'logo-wide.png'))
  await sharp(logoWide).toFile(path.join(GUI, 'logo-wide.png'))

  // Square app icon from magnifying-glass mark
  const icon1024 = await buildAppIcon(trimmedBuf)
  await sharp(icon1024).toFile(path.join(BUILD, 'icon.png'))
  await sharp(icon1024).resize(256, 256).png().toFile(path.join(BUILD, 'icon-256.png'))

  const sizeFiles = await writeSizes(icon1024, BUILD)
  // ICO with the standard Windows sizes
  const icoSizes = [16, 24, 32, 48, 64, 128, 256].map((s) => path.join(BUILD, `icon-${s}.png`))
  const ico = await pngToIco(icoSizes)
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), ico)

  // Also expose icon in gui for tray fallback if needed
  await sharp(icon1024).resize(256, 256).png().toFile(path.join(GUI, 'icon.png'))

  console.log('Wrote:')
  console.log('  build/icon.png (1024, transparent)')
  console.log('  build/icon.ico (multi-size)')
  console.log('  build/logo-wide.png + gui/logo-wide.png')
  console.log('  gui/icon.png')
  for (const f of sizeFiles) console.log(' ', path.basename(f))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
