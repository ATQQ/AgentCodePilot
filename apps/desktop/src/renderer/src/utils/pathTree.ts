import type { GitChangedFile } from '@renderer/types'

export interface PathTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children: PathTreeNode[]
  fileMeta?: GitChangedFile
}

export function buildPathTree(files: GitChangedFile[]): PathTreeNode[] {
  const root: PathTreeNode[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const nodePath = parts.slice(0, i + 1).join('/')

      let node = current.find((n) => n.name === part && n.isDirectory === !isLast)
      if (!node) {
        node = {
          name: part,
          path: nodePath,
          isDirectory: !isLast,
          children: [],
          fileMeta: isLast ? file : undefined
        }
        current.push(node)
      } else if (isLast) {
        node.fileMeta = file
        node.isDirectory = false
      }

      if (!isLast) {
        current = node.children
      }
    }
  }

  sortTree(root)
  return root
}

function sortTree(nodes: PathTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const node of nodes) {
    if (node.children.length > 0) sortTree(node.children)
  }
}

export function collectDirPaths(nodes: PathTreeNode[]): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.isDirectory) {
      paths.push(node.path)
      paths.push(...collectDirPaths(node.children))
    }
  }
  return paths
}
