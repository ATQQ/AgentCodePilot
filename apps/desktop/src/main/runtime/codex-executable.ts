import { createRequire } from 'module'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  type ExecutableProbe,
  isUsableExecutable,
  normalizeAsarExecutablePath,
  resolveGlobalExecutable
} from './executable-probe'

const require = createRequire(fileURLToPath(import.meta.url))

const CODEX_TARGETS: Record<string, string> = {
  'linux-x64': 'x86_64-unknown-linux-musl',
  'linux-arm64': 'aarch64-unknown-linux-musl',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc'
}

export function getCodexHomeDir(): string {
  return join(homedir(), '.codex')
}

/** True when the user has a local Codex CLI profile (same files the CLI reads). */
export function hasLocalCodexCliConfig(): boolean {
  const home = getCodexHomeDir()
  return existsSync(join(home, 'config.toml')) || existsSync(join(home, 'auth.json'))
}

/**
 * Prefer the user's PATH `codex` binary.
 * Bundled SDK platform binaries are excluded from the installer to keep package size small;
 * they may still resolve during local `electron-vite` development.
 */
export function probeCodexExecutable(): ExecutableProbe {
  const globalPath = resolveGlobalExecutable('codex')
  if (globalPath) return { path: globalPath, source: 'global' }
  const target = CODEX_TARGETS[`${process.platform}-${process.arch}`]
  if (!target) return { source: 'none' }
  const suffix = process.platform === 'win32' ? '.exe' : ''
  try {
    const platformPkg = `@openai/codex-${process.platform}-${process.arch}`
    const pkgJson = require.resolve(`${platformPkg}/package.json`)
    const candidate = join(dirname(pkgJson), 'vendor', target, 'bin', `codex${suffix}`)
    const resolved = normalizeAsarExecutablePath(candidate)
    return isUsableExecutable(resolved) ? { path: resolved, source: 'bundled' } : { source: 'none' }
  } catch {
    return { source: 'none' }
  }
}

export function resolveCodexExecutablePath(): string | undefined {
  return probeCodexExecutable().path
}
