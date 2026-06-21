#!/usr/bin/env node
/**
 * Generate platform icons from resources/icon.png (1024 RGBA master).
 *
 * Profiles:
 *   macDock   - transparent + pre-baked corners (dev Dock via app.dock.setIcon)
 *   macNative - transparent + square (macOS applies squircle at runtime; .icns / AppIcon.appiconset)
 *   winLinux  - white + rounded (Windows/Linux window & packaged icons)
 *   web       - white + rounded (renderer favicons / PWA assets)
 *
 * Dev consumers:
 *   apps/desktop/resources/icon-mac.png  -> mac Dock (main/index.ts)
 *   apps/desktop/resources/icon.png      -> Win/Linux BrowserWindow
 *   resources/icons/webapp/*             -> renderer publicDir (electron.vite.config.ts)
 *
 * Build consumers:
 *   apps/desktop/build/icon.icns  -> electron-builder mac (via AppIcon.iconset sync + iconutil)
 *   apps/desktop/build/icon.ico   -> electron-builder win
 *   apps/desktop/build/icon.png   -> electron-builder linux / default
 *
 * Usage:
 *   pnpm icons:generate
 *   node scripts/generate-icons.mjs [--scale=0.80] [--radius=0.1754]
 */

import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { execSync } from 'child_process'
import { existsSync, readFileSync, mkdirSync, readdirSync, unlinkSync, copyFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ICONS_DIR = join(ROOT, 'resources/icons')
const BUILD_DIR = join(ROOT, 'apps/desktop/build')
const DESKTOP_RESOURCES_DIR = join(ROOT, 'apps/desktop/resources')
const SOURCE = join(ROOT, 'resources/icon.png')
const MAC_APPICONSET_DIR = join(ICONS_DIR, 'mac/AppIcon.appiconset')

const DEFAULT_SCALE = 0.80
const DEFAULT_CORNER_RADIUS_RATIO = 0.20

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

/** @typedef {{ backgroundMode: 'transparent' | 'white'; roundCorners: boolean; scale: number }} IconProfile */

/** @type {Record<string, IconProfile>} */
const PROFILES = {
  macDock: { backgroundMode: 'transparent', roundCorners: true, scale: CONTENT_SCALE },
  macNative: { backgroundMode: 'transparent', roundCorners: false, scale: CONTENT_SCALE },
  winLinux: { backgroundMode: 'white', roundCorners: true, scale: CONTENT_SCALE },
  web: { backgroundMode: 'white', roundCorners: true, scale: CONTENT_SCALE }
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

/** @typedef {{ r: number; g: number; b: number; alpha: number }} Rgba */

/** @param {'transparent' | 'white'} mode */
function canvasBackground(mode) {
  /** @type {Rgba} */
  return mode === 'white'
    ? { r: 255, g: 255, b: 255, alpha: 1 }
    : { r: 0, g: 0, b: 0, alpha: 0 }
}

/** @param {IconProfile} profile */
function formatProfile(profile) {
  return [
    `bg=${profile.backgroundMode}`,
    `corners=${profile.roundCorners ? 'rounded' : 'square'}`,
    `scale=${(profile.scale * 100).toFixed(0)}%`
  ].join(', ')
}

async function validateSource() {
  if (!existsSync(SOURCE)) {
    console.error(`Source not found: ${SOURCE.replace(`${ROOT}/`, '')}`)
    process.exit(1)
  }

  const metadata = await sharp(SOURCE).metadata()
  if (!metadata.width || !metadata.height) {
    console.error('Source image has invalid dimensions.')
    process.exit(1)
  }

  if (metadata.hasAlpha !== true) {
    console.warn('Warning: source image has no alpha channel; transparent profiles may look incorrect.')
  }
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
 * @param {IconProfile} profile
 */
async function renderIcon(size, profile) {
  const { backgroundMode, roundCorners, scale } = profile
  const background = canvasBackground(backgroundMode)
  const contentSize = Math.max(1, Math.round(size * scale))
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
 * @param {IconProfile} profile
 */
async function writeIcon(outputPath, size, profile) {
  mkdirSync(dirname(outputPath), { recursive: true })
  const buffer = await renderIcon(size, profile)
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

/** @param {string} appIconsetDir @param {IconProfile} profile */
async function generateAppIconset(appIconsetDir, profile) {
  const entries = parseAppIconset(join(appIconsetDir, 'Contents.json'))
  const expectedFilenames = new Set(entries.map((entry) => entry.filename))

  console.log(`\n${appIconsetDir.replace(`${ROOT}/`, '')} [${formatProfile(profile)}]`)

  for (const filename of readdirSync(appIconsetDir)) {
    if (filename.endsWith('.png') && !expectedFilenames.has(filename)) {
      unlinkSync(join(appIconsetDir, filename))
    }
  }

  for (const entry of entries) {
    await writeIcon(join(appIconsetDir, entry.filename), entry.pixelSize, profile)
  }
}

async function generateFaviconIco() {
  const profile = PROFILES.web
  const sizes = [16, 32, 48, 256]
  console.log(`\nresources/icons/webapp/favicon.ico [${formatProfile(profile)}]`)
  const pngBuffers = await Promise.all(sizes.map((size) => renderIcon(size, profile)))
  const ico = await pngToIco(pngBuffers)
  const outputPath = join(ICONS_DIR, 'webapp/favicon.ico')
  writeFileSync(outputPath, ico)
  console.log(`  ${outputPath.replace(`${ROOT}/`, '')} (${sizes.join(', ')}px)`)
}

async function generateElectronBuildResources() {
  const profile = PROFILES.winLinux
  console.log(`\napps/desktop/build [${formatProfile(profile)}]`)

  await writeIcon(join(BUILD_DIR, 'icon.png'), 512, profile)

  const winSizes = [16, 32, 48, 256]
  const winBuffers = await Promise.all(winSizes.map((size) => renderIcon(size, profile)))
  writeFileSync(join(BUILD_DIR, 'icon.ico'), await pngToIco(winBuffers))
  console.log(`  apps/desktop/build/icon.ico (${winSizes.join(', ')}px)`)
}

async function generateMacIcns() {
  const iconsetDir = join(BUILD_DIR, 'AppIcon.iconset')
  const icnsPath = join(BUILD_DIR, 'icon.icns')
  console.log(`\napps/desktop/build/icon.icns [sync macNative AppIcon.appiconset -> AppIcon.iconset]`)

  mkdirSync(iconsetDir, { recursive: true })

  copyFileSync(join(MAC_APPICONSET_DIR, 'Contents.json'), join(iconsetDir, 'Contents.json'))
  for (const filename of readdirSync(MAC_APPICONSET_DIR)) {
    if (filename.endsWith('.png')) {
      copyFileSync(join(MAC_APPICONSET_DIR, filename), join(iconsetDir, filename))
    }
  }

  if (process.platform === 'darwin') {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'inherit' })
    console.log(`  ${icnsPath.replace(`${ROOT}/`, '')}`)
  } else {
    console.warn('  skip icon.icns (iconutil requires macOS)')
  }
}

async function main() {
  await validateSource()

  console.log(`Source: ${SOURCE.replace(`${ROOT}/`, '')}`)
  console.log(`Content scale: ${(CONTENT_SCALE * 100).toFixed(0)}% (${((1 - CONTENT_SCALE) / 2 * 100).toFixed(0)}% padding per side)`)
  console.log(`Corner radius: ${(CORNER_RADIUS_RATIO * 100).toFixed(2)}%`)
  console.log('Profiles:')
  for (const [name, profile] of Object.entries(PROFILES)) {
    console.log(`  ${name}: ${formatProfile(profile)}`)
  }

  await generateAppIconset(MAC_APPICONSET_DIR, PROFILES.macNative)

  console.log(`\n${join(ICONS_DIR, 'ios/AppIcon.appiconset').replace(`${ROOT}/`, '')} [${formatProfile(PROFILES.winLinux)}]`)
  for (const entry of parseAppIconset(join(ICONS_DIR, 'ios/AppIcon.appiconset/Contents.json'))) {
    await writeIcon(join(ICONS_DIR, 'ios/AppIcon.appiconset', entry.filename), entry.pixelSize, PROFILES.winLinux)
  }

  console.log(`\nresources/icons/android [${formatProfile(PROFILES.winLinux)}]`)
  for (const [folder, size] of Object.entries(ANDROID_MIPMAPS)) {
    await writeIcon(join(ICONS_DIR, 'android', folder, 'ic_launcher.png'), size, PROFILES.winLinux)
  }
  await writeIcon(join(ICONS_DIR, 'android/playstore-icon.png'), 512, PROFILES.winLinux)

  console.log(`\nresources/icons/webapp [${formatProfile(PROFILES.web)}]`)
  for (const [filename, size] of Object.entries(WEB_ICONS)) {
    await writeIcon(join(ICONS_DIR, 'webapp', filename), size, PROFILES.web)
  }
  await generateFaviconIco()

  console.log(`\napps/desktop/resources [macDock + winLinux]`)
  await writeIcon(join(DESKTOP_RESOURCES_DIR, 'icon-mac.png'), 1024, PROFILES.macDock)
  await writeIcon(join(DESKTOP_RESOURCES_DIR, 'icon.png'), 512, PROFILES.winLinux)

  await generateMacIcns()
  await generateElectronBuildResources()

  console.log('\nDone.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
