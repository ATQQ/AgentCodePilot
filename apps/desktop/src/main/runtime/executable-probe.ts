import { execFileSync } from 'child_process'
import { accessSync, constants, existsSync } from 'fs'
import { join } from 'path'
import { getShellEnvironment } from '../shell/shell-env'

export type AgentInstallSource = 'global' | 'bundled' | 'none'

export interface ExecutableProbe {
  path?: string
  source: AgentInstallSource
}

export function normalizeAsarExecutablePath(filePath: string): string {
  if (!filePath.includes('app.asar')) return filePath
  const unpacked = filePath.replace('app.asar', 'app.asar.unpacked')
  return existsSync(unpacked) ? unpacked : filePath
}

export function isUsableExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function resolveGlobalExecutable(command: string): string | undefined {
  if (process.platform === 'win32') {
    const pathVar = process.env.Path || process.env.PATH || ''
    const extensions = command.endsWith('.exe') ? [''] : ['.exe', '.cmd', '.bat', '']
    for (const dir of pathVar.split(';')) {
      for (const extension of extensions) {
        const candidate = join(dir.trim(), `${command}${extension}`)
        if (dir.trim() && isUsableExecutable(candidate)) return candidate
      }
    }
    return undefined
  }

  const shell = process.env.SHELL || '/bin/zsh'
  if (!existsSync(shell)) return undefined
  try {
    const resolved = execFileSync(shell, ['-ilc', `command -v ${command}`], {
      encoding: 'utf8',
      timeout: 10000,
      env: getShellEnvironment()
    }).trim()
    return resolved && isUsableExecutable(resolved) ? resolved : undefined
  } catch {
    return undefined
  }
}
