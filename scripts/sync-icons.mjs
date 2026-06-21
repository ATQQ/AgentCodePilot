#!/usr/bin/env node
/**
 * Copy manually prepared icon files into all consumption paths.
 * Use this when you design/convert icons outside the repo and only need to sync files.
 *
 * Prepare icons under resources/icons-manual/:
 *
 *   production/icon-mac.png     -> apps/desktop/resources/icon-mac.png (packaged dock)
 *   production/icon.png         -> apps/desktop/resources/icon.png (packaged Win/Linux window)
 *   dev/icon-mac.png            -> apps/desktop/resources/icon-mac.dev.png
 *   dev/icon.png                -> apps/desktop/resources/icon.dev.png
 *   build/icon.png              -> apps/desktop/build/icon.png
 *   build/icon.ico              -> apps/desktop/build/icon.ico
 *   build/icon.icns             -> apps/desktop/build/icon.icns
 *   webapp/*                    -> resources/icons/webapp/*
 *   mac/AppIcon.appiconset/*    -> resources/icons/mac/AppIcon.appiconset/*
 *   ios/AppIcon.appiconset/*    -> resources/icons/ios/AppIcon.appiconset/*
 *   android/**                  -> resources/icons/android/**
 *
 * Only files that exist under icons-manual/ are copied; missing entries are skipped with a note.
 *
 * Usage:
 *   pnpm icons:sync
 *   node scripts/sync-icons.mjs [--dry-run]
 */

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const MANUAL_DIR = join(ROOT, 'resources/icons-manual')
const DRY_RUN = process.argv.includes('--dry-run')

/** @type {Array<{ from: string; to: string; kind?: 'file' | 'dir' }>} */
const COPY_TARGETS = [
  {
    from: 'production/icon-mac.png',
    to: 'apps/desktop/resources/icon-mac.png'
  },
  {
    from: 'production/icon.png',
    to: 'apps/desktop/resources/icon.png'
  },
  {
    from: 'dev/icon-mac.png',
    to: 'apps/desktop/resources/icon-mac.dev.png'
  },
  {
    from: 'dev/icon.png',
    to: 'apps/desktop/resources/icon.dev.png'
  },
  {
    from: 'build/icon.png',
    to: 'apps/desktop/build/icon.png'
  },
  {
    from: 'build/icon.ico',
    to: 'apps/desktop/build/icon.ico'
  },
  {
    from: 'build/icon.icns',
    to: 'apps/desktop/build/icon.icns'
  },
  {
    from: 'webapp',
    to: 'resources/icons/webapp',
    kind: 'dir'
  },
  {
    from: 'mac/AppIcon.appiconset',
    to: 'resources/icons/mac/AppIcon.appiconset',
    kind: 'dir'
  },
  {
    from: 'ios/AppIcon.appiconset',
    to: 'resources/icons/ios/AppIcon.appiconset',
    kind: 'dir'
  },
  {
    from: 'android',
    to: 'resources/icons/android',
    kind: 'dir'
  }
]

function copyPath(from, to, kind = 'file') {
  const src = join(MANUAL_DIR, from)
  const dest = join(ROOT, to)

  if (!existsSync(src)) {
    console.log(`  skip (missing): ${from}`)
    return false
  }

  if (DRY_RUN) {
    console.log(`  would copy: ${from} -> ${to}`)
    return true
  }

  mkdirSync(dirname(dest), { recursive: true })

  if (kind === 'dir') {
    cpSync(src, dest, { recursive: true, force: true })
  } else {
    cpSync(src, dest, { force: true })
  }

  console.log(`  copied: ${from} -> ${to}`)
  return true
}

function main() {
  if (!existsSync(MANUAL_DIR)) {
    console.error(`Manual icon directory not found: ${MANUAL_DIR.replace(`${ROOT}/`, '')}`)
    console.error('Create it and add your prepared icon files, then run again.')
    process.exit(1)
  }

  console.log(`Source: ${MANUAL_DIR.replace(`${ROOT}/`, '')}`)
  if (DRY_RUN) console.log('Mode: dry-run\n')

  let copied = 0
  let skipped = 0

  for (const target of COPY_TARGETS) {
    if (copyPath(target.from, target.to, target.kind ?? 'file')) {
      copied++
    } else {
      skipped++
    }
  }

  const hasMaster = existsSync(join(MANUAL_DIR, 'master.png'))
  if (hasMaster) {
    console.log('\nNote: master.png is present but not copied automatically.')
    console.log('      Replace resources/icon.png manually, or run pnpm icons:generate after updating master.')
  }

  const manualEntries = readdirSync(MANUAL_DIR)
  const knownRoots = new Set([
    'production',
    'dev',
    'build',
    'webapp',
    'mac',
    'ios',
    'android',
    'master.png'
  ])
  for (const entry of manualEntries) {
    if (!knownRoots.has(entry)) {
      const entryPath = join(MANUAL_DIR, entry)
      if (statSync(entryPath).isFile()) {
        console.log(`\nWarning: unexpected file in icons-manual/: ${entry}`)
      }
    }
  }

  console.log(`\nDone. copied=${copied}, skipped=${skipped}`)
  if (copied === 0) {
    console.error('\nNo files copied. Add icons under resources/icons-manual/ first.')
    process.exit(1)
  }
}

main()
