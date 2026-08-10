import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/** Command-line markers that identify this app (dev Electron or packaged binary). */
const APP_MARKERS = [
  'agent-desktop-app',
  '@agent-code-pilot',
  'AgentCodePilot',
  'com.agentcodepilot'
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function listListeningPids(port: number): Promise<number[]> {
  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`
      ],
      { encoding: 'utf8', windowsHide: true }
    )
    return parsePidList(stdout)
  }

  const { stdout } = await execFileAsync('lsof', ['-t', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8'
  })
  return parsePidList(stdout)
}

function parsePidList(stdout: string): number[] {
  const pids = new Set<number>()
  for (const part of stdout.split(/[\s,]+/)) {
    const pid = Number(part.trim())
    if (Number.isInteger(pid) && pid > 0) pids.add(pid)
  }
  return [...pids]
}

async function readProcessCommand(pid: number): Promise<string> {
  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`
      ],
      { encoding: 'utf8', windowsHide: true }
    )
    return stdout.trim()
  }

  const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-ww', '-o', 'args='], {
    encoding: 'utf8'
  })
  return stdout.trim()
}

function isOurAppProcess(pid: number, command: string): boolean {
  if (pid === process.pid) return false
  if (typeof process.ppid === 'number' && pid === process.ppid) return false
  if (!command) return false
  const lower = command.toLowerCase()
  return APP_MARKERS.some((marker) => lower.includes(marker.toLowerCase()))
}

/**
 * If the port is held by a leftover instance of this app, terminate it so we can rebind.
 * Returns the PIDs that were signaled. Non-app occupants are left alone.
 */
export async function reclaimGatewayPort(port: number): Promise<number[]> {
  let pids: number[]
  try {
    pids = await listListeningPids(port)
  } catch {
    return []
  }

  const killed: number[] = []
  for (const pid of pids) {
    let command = ''
    try {
      command = await readProcessCommand(pid)
    } catch {
      continue
    }

    if (!isOurAppProcess(pid, command)) {
      console.warn(
        `[Gateway] port ${port} held by non-app process ${pid}: ${command.slice(0, 160) || '(unknown)'}`
      )
      continue
    }

    console.warn(
      `[Gateway] reclaiming port ${port} from leftover pid ${pid}: ${command.slice(0, 160)}`
    )
    try {
      process.kill(pid, 'SIGTERM')
      killed.push(pid)
    } catch (error) {
      console.warn(`[Gateway] failed to SIGTERM pid ${pid}:`, error)
    }
  }

  if (killed.length === 0) return []

  await sleep(400)
  for (const pid of killed) {
    try {
      process.kill(pid, 0)
      process.kill(pid, 'SIGKILL')
    } catch {
      // already dead
    }
  }
  await sleep(200)
  return killed
}
