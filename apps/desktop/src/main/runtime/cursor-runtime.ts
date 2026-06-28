export function isCursorRuntimeSupported(): boolean {
  const [major, minor, patch] = process.versions.node.split('.').map((part) => Number(part))
  if (major > 22) return true
  if (major < 22) return false
  if (minor > 13) return true
  if (minor < 13) return false
  return patch >= 0
}
