/**
 * Trim platform-specific junk that electron-builder would otherwise ship:
 * - node-pty prebuilds for other OS/arch
 * - Claude / Codex platform CLI packages (if still present in node_modules)
 */
const fs = require('fs')
const path = require('path')
const { Arch } = require('electron-builder')

function rmrf(target) {
  if (!fs.existsSync(target)) return
  fs.rmSync(target, { recursive: true, force: true })
}

function findUnpackedRoot(appOutDir, electronPlatformName) {
  if (electronPlatformName === 'darwin') {
    const apps = fs.readdirSync(appOutDir).filter((name) => name.endsWith('.app'))
    if (apps.length === 0) return null
    return path.join(appOutDir, apps[0], 'Contents', 'Resources', 'app.asar.unpacked')
  }
  return path.join(appOutDir, 'resources', 'app.asar.unpacked')
}

function pruneNodePtyPrebuilds(unpackedRoot, keepDir) {
  const prebuilds = path.join(unpackedRoot, 'node_modules', 'node-pty', 'prebuilds')
  if (!fs.existsSync(prebuilds)) return
  for (const entry of fs.readdirSync(prebuilds)) {
    if (entry !== keepDir) {
      rmrf(path.join(prebuilds, entry))
    }
  }
}

function pruneAgentCliPackages(unpackedRoot) {
  const scopes = [
    ['@anthropic-ai', /^claude-agent-sdk-/],
    ['@openai', /^codex-/]
  ]
  for (const [scope, pattern] of scopes) {
    const scopeDir = path.join(unpackedRoot, 'node_modules', scope)
    if (!fs.existsSync(scopeDir)) continue
    for (const entry of fs.readdirSync(scopeDir)) {
      if (pattern.test(entry)) {
        rmrf(path.join(scopeDir, entry))
      }
    }
  }
}

exports.default = async function afterPack(context) {
  const archName = Arch[context.arch]
  if (!archName) return

  const keepDir = `${context.electronPlatformName}-${archName}`
  const unpackedRoot = findUnpackedRoot(context.appOutDir, context.electronPlatformName)
  if (!unpackedRoot || !fs.existsSync(unpackedRoot)) return

  pruneNodePtyPrebuilds(unpackedRoot, keepDir)
  pruneAgentCliPackages(unpackedRoot)
}
