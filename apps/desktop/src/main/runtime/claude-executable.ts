import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  type ExecutableProbe,
  isUsableExecutable,
  normalizeAsarExecutablePath,
  resolveGlobalExecutable
} from './executable-probe'

const require = createRequire(fileURLToPath(import.meta.url))

/**
 * Prefer a user-installed Claude CLI, then fall back to the SDK platform binary.
 */
export function probeClaudeCodeExecutable(): ExecutableProbe {
  const globalPath = resolveGlobalExecutable('claude')
  if (globalPath) return { path: globalPath, source: 'global' }

  const suffix = process.platform === 'win32' ? '.exe' : ''
  const platformPkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`

  try {
    const pkgJson = require.resolve(`${platformPkg}/package.json`)
    const candidate = join(dirname(pkgJson), `claude${suffix}`)
    const resolved = normalizeAsarExecutablePath(candidate)
    return isUsableExecutable(resolved) ? { path: resolved, source: 'bundled' } : { source: 'none' }
  } catch {
    return { source: 'none' }
  }
}

export function resolveClaudeCodeExecutablePath(): string | undefined {
  return probeClaudeCodeExecutable().path
}
