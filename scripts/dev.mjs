#!/usr/bin/env node
/**
 * Dev launcher with reliable Ctrl+C shutdown.
 *
 * electron-vite dev spawns Electron + Vite watch servers but does not always
 * tear down the whole process tree on SIGINT, which leaves the terminal stuck.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const desktopDir = join(root, 'apps/desktop')
const isWin = process.platform === 'win32'

const child = spawn(isWin ? 'pnpm.cmd' : 'pnpm', ['exec', 'electron-vite', 'dev'], {
  cwd: desktopDir,
  stdio: 'inherit',
  env: process.env,
  ...(isWin ? {} : { detached: true })
})

let shutdownAttempts = 0

function killProcessTree(signal) {
  if (!child.pid) return
  if (isWin) {
    child.kill(signal)
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch {
    child.kill(signal)
  }
}

function shutdown() {
  shutdownAttempts += 1
  if (shutdownAttempts === 1) {
    killProcessTree('SIGINT')
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        killProcessTree('SIGTERM')
      }
    }, 1500).unref()
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        killProcessTree('SIGKILL')
        process.exit(130)
      }
    }, 5000).unref()
    return
  }
  killProcessTree('SIGKILL')
  process.exit(130)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

child.on('exit', (code, signal) => {
  if (signal === 'SIGINT' || signal === 'SIGTERM') {
    process.exit(130)
    return
  }
  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error('[dev] failed to start electron-vite:', error)
  process.exit(1)
})
