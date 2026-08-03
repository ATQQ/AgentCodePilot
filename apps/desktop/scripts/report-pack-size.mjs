#!/usr/bin/env node
/**
 * Summarize unpacked Electron app sizes under apps/desktop/dist.
 * Usage: pnpm report:size
 */
import { existsSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const desktopRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const distRoot = join(desktopRoot, 'dist')

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

/** Prefer `du -sk` so hardlinked Electron Framework files are not double-counted. */
function pathSize(target) {
  if (!existsSync(target)) return 0
  try {
    const out = execFileSync('du', ['-sk', target], { encoding: 'utf8' })
    const kb = Number.parseInt(out.split(/\s+/)[0], 10)
    return Number.isFinite(kb) ? kb * 1024 : 0
  } catch {
    try {
      return statSync(target).size
    } catch {
      return 0
    }
  }
}

function findApps(root) {
  const results = []
  if (!existsSync(root)) return results

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const full = join(root, entry.name)

    // Prefer platform output dirs from electron-builder --dir
    if (/^(mac|win|linux)(-|$)/.test(entry.name) || entry.name.endsWith('-unpacked')) {
      for (const child of readdirSync(full, { withFileTypes: true })) {
        if (!child.isDirectory()) continue
        const childPath = join(full, child.name)
        if (child.name.endsWith('.app')) {
          results.push(childPath)
        } else if (
          child.name.endsWith('-unpacked') ||
          existsSync(join(childPath, 'resources', 'app.asar'))
        ) {
          results.push(childPath)
        }
      }
      if (existsSync(join(full, 'resources', 'app.asar'))) {
        results.push(full)
      }
    }
  }

  return [...new Set(results)]
}

function reportAppBundle(appPath) {
  const rel = relative(distRoot, appPath)
  const isMacApp = appPath.endsWith('.app')
  const resources = isMacApp ? join(appPath, 'Contents', 'Resources') : join(appPath, 'resources')
  const asar = join(resources, 'app.asar')
  const unpacked = join(resources, 'app.asar.unpacked')
  const frameworks = isMacApp ? join(appPath, 'Contents', 'Frameworks') : null

  console.log(`\n${rel}`)
  console.log(`  total:             ${formatBytes(pathSize(appPath))}`)
  if (frameworks && existsSync(frameworks)) {
    console.log(`  Frameworks:        ${formatBytes(pathSize(frameworks))}`)
  }
  if (existsSync(asar)) {
    console.log(`  app.asar:          ${formatBytes(pathSize(asar))}`)
  }
  if (existsSync(unpacked)) {
    console.log(`  app.asar.unpacked: ${formatBytes(pathSize(unpacked))}`)
    const anthropic = join(unpacked, 'node_modules', '@anthropic-ai')
    const openai = join(unpacked, 'node_modules', '@openai')
    const pty = join(unpacked, 'node_modules', 'node-pty')
    if (existsSync(anthropic))
      console.log(`    @anthropic-ai:   ${formatBytes(pathSize(anthropic))}`)
    if (existsSync(openai)) console.log(`    @openai:         ${formatBytes(pathSize(openai))}`)
    if (existsSync(pty)) console.log(`    node-pty:        ${formatBytes(pathSize(pty))}`)
  }
}

if (!existsSync(distRoot)) {
  console.error(`No dist/ found at ${distRoot}. Run pnpm build:unpack first.`)
  process.exit(1)
}

const apps = findApps(distRoot)
if (apps.length === 0) {
  console.error('No packaged app found under dist/. Run pnpm build:unpack first.')
  process.exit(1)
}

console.log('Pack size report')
console.log(`dist: ${distRoot}`)
for (const app of apps) {
  reportAppBundle(app)
}
console.log('')
