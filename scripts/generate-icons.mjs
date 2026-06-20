#!/usr/bin/env node
/**
 * Generate platform icons from resources/icons/origin.png with unified safe-area scaling.
 *
 * Usage:
 *   node scripts/generate-icons.mjs [--scale=0.82] [--radius=0.1754]
 */

import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { execSync } from 'child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ICONS_DIR = join(ROOT, 'resources/icons')
const BUILD_DIR = join(ROOT, 'apps/desktop/build')
const SOURCE = join(ICONS_DIR, 'origin.png')

const DEFAULT_SCALE = 0.82
const DEFAULT_CORNER_RADIUS_RATIO = 0.1754

const scaleArg = process.argv.find((arg) => arg.startsWith('--scale='))
const CONTENT_SCALE = scaleArg ? Number.parseFloat(scaleArg.split('=')[1]) : DEFAULT_SCALE

const radiusArg = process.argv.find((arg) => arg.startsWith('--radius='))
const CORNER_RADIUS_RATIO = radiusArg
  ? Number.parseFloat(radiusArg.split('=')[1])
  : DEFAULT_CORNER_RADIUS_RATIO

if (!Number.isFinite(CONTENT_SCALE) || CONTENT_SCALE <= 0 || CONTENT_SCALE > 1) {
  console.error(`Invalid scale: ${CONTENT_SCALE}. Expected 0 < scale <= 1.`)
  process.exit(1)
}

if (!Number.isFinite(CORNER_RADIUS_RATIO) || CORNER_RADIUS_RATIO < 0 || CORNER_RADIUS_RATIO > 0.5) {
  console.error(`Invalid radius: ${CORNER_RADIUS_RATIO}. Expected 0 <= radius <= 0.5.`)
  process.exit(1)
}

const ANDROID_MIPMAPS = {
  'mipmap-ldpi': 36,
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
}

const WEB_ICONS = {
  'favicon-16x16.png': 16,
  'favicon-32x32.png': 32,
  'apple-touch-icon.png': 180,
  'android-chrome-192x192.png': 192,
  'android-chrome-512x512.png': 512
}

/** iconutil expects icon_<w>x<h>[@2x].png filenames. */
const MAC_ICONSET_FILES = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024]
]

/** @typedef {{ r: number; g: number; b: number; alpha: number }} Rgba */
/** @typedef {{ backgroundMode?: 'transparent' | 'white'; roundCorners?: boolean }} RenderOptions */

/** @param {'transparent' | 'white'} mode */
function canvasBackground(mode) {
  /** @type {Rgba} */
  return mode === 'white'
    ? { r: 255, g: 255, b: 255, alpha: 1 }
    : { r: 0, g: 0, b: 0, alpha: 0 }
}

/**
 * @param {Buffer} buffer
 * @param {number} size
 */
async function applyRoundedCorners(buffer, size) {
  const radius = size * CORNER_RADIUS_RATIO
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`
  )

  return sharp(buffer)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

/**
 * @param {number} size
 * @param {RenderOptions} options
 */
async function renderIcon(size, options = {}) {
  const { backgroundMode = 'white', roundCorners = true } = options
  const background = canvasBackground(backgroundMode)
  const contentSize = Math.max(1, Math.round(size * CONTENT_SCALE))
  const offset = Math.round((size - contentSize) / 2)

  const resized = await sharp(SOURCE)
    .resize(contentSize, contentSize, { fit: 'contain', background })
    .png()
    .toBuffer()

  const composed = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background
    }
  })
    .composite([{ input: resized, left: offset, top: offset }])
    .png()
    .toBuffer()

  if (!roundCorners) return composed
  return applyRoundedCorners(composed, size)
}

/**
 * @param {string} outputPath
 * @param {number} size
 * @param {RenderOptions} options
 */
async function writeIcon(outputPath, size, options = {}) {
  mkdirSync(dirname(outputPath), { recursive: true })
  const buffer = await renderIcon(size, options)
  await sharp(buffer).toFile(outputPath)
  console.log(`  ${outputPath.replace(`${ROOT}/`, '')} (${size}x${size})`)
}

/** @param {string} contentsPath */
function parseAppIconset(contentsPath) {
  const json = JSON.parse(readFileSync(contentsPath, 'utf8'))
  return json.images.map((img) => {
    const baseSize = Number.parseFloat(String(img.size).split('x')[0])
    const scale = Number.parseInt(String(img.scale).replace('x', ''), 10)
    return {
      filename: img.filename,
      pixelSize: Math.round(baseSize * scale)
    }
  })
}

/** @param {string} appIconsetDir */
async function generateAppIconset(appIconsetDir) {
  const entries = parseAppIconset(join(appIconsetDir, 'Contents.json'))
  console.log(`\n${appIconsetDir.replace(`${ROOT}/`, '')}`)
  for (const entry of entries) {
    await writeIcon(join(appIconsetDir, entry.filename), entry.pixelSize, {
      backgroundMode: 'transparent',
      roundCorners: false
    })
  }
}

async function generateFaviconIco() {
  const sizes = [16, 32, 48, 256]
  const pngBuffers = await Promise.all(
    sizes.map((size) => renderIcon(size, { backgroundMode: 'white', roundCorners: true }))
  )
  const ico = await pngToIco(pngBuffers)
  const outputPath = join(ICONS_DIR, 'webapp/favicon.ico')
  writeFileSync(outputPath, ico)
  console.log(`  ${outputPath.replace(`${ROOT}/`, '')} (${sizes.join(', ')}px)`)
}

async function generateElectronBuildResources() {
  const iconsetDir = join(BUILD_DIR, 'AppIcon.iconset')
  const icnsPath = join(BUILD_DIR, 'icon.icns')
  const macOptions = { backgroundMode: 'transparent', roundCorners: false }

  console.log('\napps/desktop/build')
  mkdirSync(iconsetDir, { recursive: true })

  for (const [filename, size] of MAC_ICONSET_FILES) {
    await writeIcon(join(iconsetDir, filename), size, macOptions)
  }

  if (process.platform === 'darwin') {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'inherit' })
    console.log(`  ${icnsPath.replace(`${ROOT}/`, '')}`)
  } else {
    console.warn('  skip icon.icns (iconutil requires macOS)')
  }

  await writeIcon(join(BUILD_DIR, 'icon.png'), 512, {
    backgroundMode: 'white',
    roundCorners: true
  })

  const winSizes = [16, 32, 48, 256]
  const winBuffers = await Promise.all(
    winSizes.map((size) => renderIcon(size, { backgroundMode: 'white', roundCorners: true }))
  )
  writeFileSync(join(BUILD_DIR, 'icon.ico'), await pngToIco(winBuffers))
  console.log(`  apps/desktop/build/icon.ico (${winSizes.join(', ')}px)`)
}

async function main() {
  const rounded = { backgroundMode: 'white', roundCorners: true }

  console.log(`Source: ${SOURCE.replace(`${ROOT}/`, '')}`)
  console.log(`Content scale: ${(CONTENT_SCALE * 100).toFixed(0)}%`)
  console.log(`Corner radius: ${(CORNER_RADIUS_RATIO * 100).toFixed(2)}%`)

  await generateAppIconset(join(ICONS_DIR, 'mac/AppIcon.appiconset'))

  console.log(`\n${join(ICONS_DIR, 'ios/AppIcon.appiconset').replace(`${ROOT}/`, '')}`)
  for (const entry of parseAppIconset(join(ICONS_DIR, 'ios/AppIcon.appiconset/Contents.json'))) {
    await writeIcon(join(ICONS_DIR, 'ios/AppIcon.appiconset', entry.filename), entry.pixelSize, rounded)
  }

  console.log('\nresources/icons/android')
  for (const [folder, size] of Object.entries(ANDROID_MIPMAPS)) {
    await writeIcon(join(ICONS_DIR, 'android', folder, 'ic_launcher.png'), size, rounded)
  }
  await writeIcon(join(ICONS_DIR, 'android/playstore-icon.png'), 512, rounded)

  console.log('\nresources/icons/webapp')
  for (const [filename, size] of Object.entries(WEB_ICONS)) {
    await writeIcon(join(ICONS_DIR, 'webapp', filename), size, rounded)
  }
  await generateFaviconIco()

  console.log('\napps/desktop/resources')
  await writeIcon(join(ROOT, 'apps/desktop/resources/icon.png'), 512, rounded)
  await writeIcon(join(ROOT, 'apps/desktop/resources/icon-mac.png'), 1024, rounded)

  await generateElectronBuildResources()

  console.log('\nDone.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
