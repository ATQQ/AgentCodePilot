import { createRequire } from 'module'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(fileURLToPath(import.meta.url))

function normalizeAsarPath(filePath: string): string {
  if (!filePath.includes('app.asar')) return filePath
  const unpacked = filePath.replace('app.asar', 'app.asar.unpacked')
  return existsSync(unpacked) ? unpacked : filePath
}

/**
 * Resolve the bundled Claude Code native CLI, fixing asar paths for spawn().
 */
export function resolveClaudeCodeExecutablePath(): string | undefined {
  const suffix = process.platform === 'win32' ? '.exe' : ''
  const platformPkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`

  try {
    const pkgJson = require.resolve(`${platformPkg}/package.json`)
    const candidate = join(dirname(pkgJson), `claude${suffix}`)
    const resolved = normalizeAsarPath(candidate)
    return existsSync(resolved) ? resolved : undefined
  } catch {
    return undefined
  }
}
