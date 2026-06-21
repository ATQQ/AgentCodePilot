#!/usr/bin/env node
/**
 * Interactive version bump for AgentCodePilot.
 *
 * Updates:
 *   - package.json
 *   - apps/desktop/package.json
 *
 * electron-builder reads version from apps/desktop/package.json when packaging.
 *
 * Usage:
 *   pnpm version:bump
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline/promises'
import { stdin as input, stdout as output } from 'process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const VERSION_FILES = [
  join(ROOT, 'package.json'),
  join(ROOT, 'apps/desktop/package.json')
]

/** @param {string} version */
function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/.exec(version.trim())
  if (!match) return null
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4]
  }
}

/** @param {{ major: number; minor: number; patch: number; prerelease?: string }} parts */
function formatVersion(parts) {
  const base = `${parts.major}.${parts.minor}.${parts.patch}`
  return parts.prerelease ? `${base}-${parts.prerelease}` : base
}

/** @param {string} current @param {'patch' | 'minor' | 'major'} type */
function bumpVersion(current, type) {
  const parts = parseVersion(current)
  if (!parts) {
    throw new Error(`Invalid semver: ${current}`)
  }

  const next = { ...parts, prerelease: undefined }
  if (type === 'patch') next.patch += 1
  if (type === 'minor') {
    next.minor += 1
    next.patch = 0
  }
  if (type === 'major') {
    next.major += 1
    next.minor = 0
    next.patch = 0
  }

  return formatVersion(next)
}

/** @param {string} filePath @param {string} version */
function writeVersion(filePath, version) {
  const json = JSON.parse(readFileSync(filePath, 'utf8'))
  json.version = version
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
}

/** @param {string} current @param {string} next */
function printGitInstructions(current, next) {
  const tag = `v${next}`
  const relativeFiles = VERSION_FILES.map((file) => file.replace(`${ROOT}/`, ''))

  console.log('\nUpdated files:')
  for (const file of relativeFiles) {
    console.log(`  - ${file}`)
  }

  console.log(`\nVersion: ${current} -> ${next}`)
  console.log('\nRun these git commands to release:\n')
  console.log(`git add ${relativeFiles.join(' ')}`)
  console.log(`git commit -m "chore: release ${tag}"`)
  console.log(`git tag ${tag}`)
  console.log('git push origin main')
  console.log(`git push origin ${tag}`)
  console.log('\nPushing the tag triggers the Release workflow on GitHub Actions.')
}

async function main() {
  const rootPkg = JSON.parse(readFileSync(VERSION_FILES[0], 'utf8'))
  const desktopPkg = JSON.parse(readFileSync(VERSION_FILES[1], 'utf8'))
  const current = rootPkg.version

  if (rootPkg.version !== desktopPkg.version) {
    console.warn(
      `Warning: version mismatch detected (root=${rootPkg.version}, desktop=${desktopPkg.version}).`
    )
    console.warn('This script will sync both files to the same new version.\n')
  }

  console.log(`Current version: ${current}`)
  console.log('\nChoose bump type:')
  console.log(`  1) patch  (${current} -> ${bumpVersion(current, 'patch')})`)
  console.log(`  2) minor  (${current} -> ${bumpVersion(current, 'minor')})`)
  console.log(`  3) major  (${current} -> ${bumpVersion(current, 'major')})`)
  console.log('  4) custom (enter manually)')
  console.log('  5) cancel')

  const rl = readline.createInterface({ input, output })
  const answer = (await rl.question('\nSelect [1-5]: ')).trim()

  /** @type {string | null} */
  let next = null

  switch (answer) {
    case '1':
      next = bumpVersion(current, 'patch')
      break
    case '2':
      next = bumpVersion(current, 'minor')
      break
    case '3':
      next = bumpVersion(current, 'major')
      break
    case '4': {
      const custom = (await rl.question('Enter new version (semver): ')).trim()
      if (!parseVersion(custom)) {
        rl.close()
        console.error(`Invalid semver: ${custom}`)
        process.exit(1)
      }
      next = custom
      break
    }
    case '5':
      rl.close()
      console.log('Cancelled.')
      return
    default:
      rl.close()
      console.error('Invalid selection.')
      process.exit(1)
  }

  rl.close()

  if (next === current) {
    console.log('Version unchanged.')
    return
  }

  for (const file of VERSION_FILES) {
    writeVersion(file, next)
  }

  printGitInstructions(current, next)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
