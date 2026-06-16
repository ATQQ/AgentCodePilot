import { protocol, net } from 'electron'
import { pathToFileURL } from 'url'
import { existsSync } from 'fs'

export function registerLocalFileScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'local-file',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
        bypassCSP: true
      }
    }
  ])
}

function resolveLocalFilePath(requestUrl: string): string {
  const url = new URL(requestUrl)
  const encodedPath = url.pathname.replace(/^\/+/, '')
  let filePath = decodeURIComponent(encodedPath)
  if (process.platform === 'win32') {
    if (/^\/[a-zA-Z]:/.test(url.pathname)) {
      filePath = decodeURIComponent(url.pathname.slice(1))
    } else if (/^[a-zA-Z]:/.test(filePath) === false) {
      const driveMatch = url.pathname.match(/^\/+([a-zA-Z]:.*)$/)
      if (driveMatch) {
        filePath = decodeURIComponent(driveMatch[1])
      }
    }
  }
  return filePath
}

export function registerLocalFileProtocol(): void {
  protocol.handle('local-file', (request) => {
    const filePath = resolveLocalFilePath(request.url)
    if (!existsSync(filePath)) {
      return new Response('Not Found', { status: 404 })
    }
    return net.fetch(pathToFileURL(filePath).href)
  })
}
