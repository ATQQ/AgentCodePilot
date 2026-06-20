import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { promisify } from 'util'
import { shell } from 'electron'
import type { ExternalAppKind, OpenPathResult } from '../../shared/externalApps'
import { buildProtocolUrl } from '../../shared/externalApps'

const execFileAsync = promisify(execFile)

export interface OpenPathWithAppOptions {
  path: string
  kind: ExternalAppKind
  protocol?: string
  appName?: string
}

function fail(error: OpenPathResult['error'], message: string): OpenPathResult {
  return { success: false, error, message }
}

function ok(): OpenPathResult {
  return { success: true }
}

async function openUrl(url: string): Promise<OpenPathResult> {
  if (process.platform === 'darwin') {
    try {
      await execFileAsync('open', [url])
      return ok()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/Unable to find application|kLSApplicationNotFoundErr|does not appear to be/i.test(message)) {
        return fail('NOT_INSTALLED', message)
      }
      return fail('UNKNOWN', message)
    }
  }

  try {
    await shell.openExternal(url)
    return ok()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return fail('UNKNOWN', message)
  }
}

async function openMacApp(appName: string, folderPath: string): Promise<OpenPathResult> {
  try {
    await execFileAsync('open', ['-a', appName, folderPath])
    return ok()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/Unable to find application|kLSApplicationNotFoundErr/i.test(message)) {
      return fail('NOT_INSTALLED', message)
    }
    return fail('UNKNOWN', message)
  }
}

export async function openPathWithApp(options: OpenPathWithAppOptions): Promise<OpenPathResult> {
  const { path, kind, protocol } = options
  if (!path || !existsSync(path)) {
    return fail('PATH_NOT_FOUND', '路径不存在')
  }

  switch (kind) {
    case 'reveal':
      shell.showItemInFolder(path)
      return ok()
    case 'finder': {
      const result = await shell.openPath(path)
      if (result) return fail('UNKNOWN', result)
      return ok()
    }
    case 'terminal':
      if (process.platform === 'darwin') {
        return openMacApp('Terminal', path)
      }
      if (process.platform === 'win32') {
        try {
          await execFileAsync('cmd.exe', ['/c', 'start', 'cmd.exe', '/K', `cd /d "${path}"`])
          return ok()
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return fail('UNKNOWN', message)
        }
      }
      try {
        await execFileAsync('x-terminal-emulator', ['--working-directory', path])
        return ok()
      } catch {
        const result = await shell.openPath(path)
        if (result) return fail('UNKNOWN', result)
        return ok()
      }
    case 'protocol': {
      if (!protocol?.includes('{path}')) {
        return fail('INVALID_PROTOCOL', '协议模板无效')
      }
      const url = buildProtocolUrl(protocol, path)
      return openUrl(url)
    }
    default:
      return fail('UNKNOWN', '不支持的外部打开方式')
  }
}
