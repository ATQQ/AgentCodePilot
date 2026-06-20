export interface CompressibleTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children: CompressibleTreeNode[]
}

export interface TreeCompressionGroup {
  prefixLabel: string
  prefixPath: string
  terminalDirPath: string
  items: CompressibleTreeNode[]
  singleFile: boolean
}

const MIN_PREFIX_DEPTH = 2

export function analyzeSingleBranchCompression(
  node: CompressibleTreeNode
): TreeCompressionGroup | null {
  if (!node.isDirectory) return null

  const parts = [node.name]
  let current = node

  while (current.children.length === 1) {
    const child = current.children[0]
    if (!child.isDirectory) {
      if (parts.length >= MIN_PREFIX_DEPTH) {
        return {
          prefixLabel: parts.join('/'),
          prefixPath: current.path,
          terminalDirPath: current.path,
          items: [child],
          singleFile: true
        }
      }
      return null
    }
    parts.push(child.name)
    current = child
  }

  if (parts.length >= MIN_PREFIX_DEPTH && current.isDirectory && current.children.length > 1) {
    return {
      prefixLabel: parts.join('/'),
      prefixPath: current.path,
      terminalDirPath: current.path,
      items: current.children,
      singleFile: false
    }
  }

  return null
}

export function analyzeFileEntryCompression(
  entry: { name: string; path: string; isDirectory: boolean },
  getItems: (dir: string) => { name: string; path: string; isDirectory: boolean }[],
  isExpanded: (dir: string) => boolean
): TreeCompressionGroup | null {
  if (!entry.isDirectory || !isExpanded(entry.path)) return null

  const node = buildFileEntrySnapshot(entry, getItems, isExpanded)
  return analyzeSingleBranchCompression(node)
}

function buildFileEntrySnapshot(
  entry: { name: string; path: string; isDirectory: boolean },
  getItems: (dir: string) => { name: string; path: string; isDirectory: boolean }[],
  isExpanded: (dir: string) => boolean
): CompressibleTreeNode {
  if (!entry.isDirectory) {
    return { ...entry, children: [] }
  }

  const children = getItems(entry.path).map((child) => {
    if (!child.isDirectory || !isExpanded(child.path)) {
      return { ...child, children: [] }
    }
    return buildFileEntrySnapshot(child, getItems, isExpanded)
  })

  return { ...entry, children }
}
