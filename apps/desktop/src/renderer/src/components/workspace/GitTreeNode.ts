import { defineComponent, h, type PropType, type VNode } from 'vue'
import { RefreshLeft, Plus } from '@element-plus/icons-vue'
import type { PathTreeNode } from '@renderer/utils/pathTree'
import { aggregateDirStats, collectFilePathsUnder } from '@renderer/utils/pathTree'
import {
  analyzeSingleBranchCompression,
  type CompressibleTreeNode
} from '@renderer/utils/treeCompression'
import { getFileLanguageIconHtml } from '@renderer/utils/fileLanguageIcon'
import i18n from '@renderer/i18n'

const actionIconStyle = { width: '14px', height: '14px' }
const t = i18n.global.t

function toCompressibleNode(node: PathTreeNode): CompressibleTreeNode {
  return {
    name: node.name,
    path: node.path,
    isDirectory: node.isDirectory,
    children: node.children.map(toCompressibleNode)
  }
}

function findNodeInTree(root: PathTreeNode, path: string): PathTreeNode | undefined {
  if (root.path === path) return root
  for (const child of root.children) {
    const found = findNodeInTree(child, path)
    if (found) return found
  }
  return undefined
}

export const GitTreeNode = defineComponent({
  name: 'GitTreeNode',
  props: {
    node: { type: Object as PropType<PathTreeNode>, required: true },
    depth: { type: Number, default: 0 },
    selectedFile: { type: String as PropType<string | null>, default: null },
    scope: { type: String as PropType<'unstaged' | 'staged'>, required: true },
    isExpanded: { type: Function as PropType<(path: string) => boolean>, required: true }
  },
  emits: ['toggleDir', 'select', 'stage', 'unstage', 'discard'],
  setup(props, { emit }) {
    function renderActionButtons(
      paths: string[],
      options?: { isDirectory?: boolean }
    ): VNode | null {
      if (paths.length === 0) return null
      const isDirectory = options?.isDirectory ?? paths.length > 1
      const discardTitle = isDirectory ? t('review.discardDir') : '放弃更改'
      const stageTitle = isDirectory ? t('review.stageDir') : '暂存'
      const unstageTitle = isDirectory ? t('review.unstageDir') : '取消暂存'

      return h('span', { class: 'file-actions' }, [
        props.scope === 'unstaged'
          ? h(
              'button',
              {
                type: 'button',
                class: 'action-btn discard',
                title: discardTitle,
                onClick: (e: Event) => {
                  e.stopPropagation()
                  emit('discard', paths)
                }
              },
              [h(RefreshLeft, { style: actionIconStyle })]
            )
          : null,
        props.scope === 'unstaged'
          ? h(
              'button',
              {
                type: 'button',
                class: 'action-btn stage',
                title: stageTitle,
                onClick: (e: Event) => {
                  e.stopPropagation()
                  emit('stage', paths)
                }
              },
              [h(Plus, { style: actionIconStyle })]
            )
          : h(
              'button',
              {
                type: 'button',
                class: 'action-btn unstage',
                title: unstageTitle,
                onClick: (e: Event) => {
                  e.stopPropagation()
                  emit('unstage', paths)
                }
              },
              '−'
            )
      ])
    }

    function renderStats(additions: number, deletions: number): VNode {
      return h('span', { class: 'file-stat' }, [
        h('span', { class: 'add' }, `+${additions}`),
        h('span', { class: 'del' }, `-${deletions}`)
      ])
    }

    function renderCompressedPrefix(label: string, depth: number, dirNode: PathTreeNode): VNode {
      const paths = collectFilePathsUnder(dirNode)
      const stats = aggregateDirStats(dirNode)

      return h(
        'div',
        {
          class: 'compressed-path-row',
          style: { paddingLeft: `${8 + depth * 14}px` },
          title: label
        },
        [
          h('span', { class: 'compressed-path-label' }, label),
          renderActionButtons(paths, { isDirectory: true }),
          renderStats(stats.additions, stats.deletions)
        ]
      )
    }

    function renderFileRow(node: PathTreeNode, depth: number): VNode {
      const isActive = props.selectedFile === node.path
      const filePath = node.fileMeta?.path ?? node.path

      return h(
        'button',
        {
          class: ['file-row', 'leaf', { active: isActive }],
          style: { paddingLeft: `${8 + depth * 14}px` },
          onClick: () => {
            if (node.fileMeta) emit('select', node.fileMeta.path)
          }
        },
        [
          h('span', {
            class: 'file-lang-icon',
            innerHTML: getFileLanguageIconHtml(node.path)
          }),
          h('span', { class: 'file-name', title: node.path }, node.name),
          node.fileMeta ? renderActionButtons([filePath]) : null,
          node.fileMeta ? renderStats(node.fileMeta.additions, node.fileMeta.deletions) : null
        ]
      )
    }

    function renderDirRow(node: PathTreeNode, depth: number): VNode {
      const expanded = props.isExpanded(node.path)
      const children = expanded ? node.children : []
      const paths = collectFilePathsUnder(node)
      const stats = aggregateDirStats(node)

      return h('div', { class: 'git-tree-node' }, [
        h(
          'button',
          {
            class: ['file-row', 'dir'],
            style: { paddingLeft: `${8 + depth * 14}px` },
            onClick: () => emit('toggleDir', node.path)
          },
          [
            h('span', { class: 'expand-icon' }, expanded ? '▾' : '▸'),
            h('span', { class: 'file-name', title: node.path }, node.name),
            renderActionButtons(paths, { isDirectory: true }),
            renderStats(stats.additions, stats.deletions)
          ]
        ),
        ...children.map((child: PathTreeNode) =>
          h(GitTreeNode, {
            key: child.path,
            node: child,
            depth: depth + 1,
            selectedFile: props.selectedFile,
            scope: props.scope,
            isExpanded: props.isExpanded,
            onToggleDir: (p: string) => emit('toggleDir', p),
            onSelect: (p: string) => emit('select', p),
            onStage: (paths: string[]) => emit('stage', paths),
            onUnstage: (paths: string[]) => emit('unstage', paths),
            onDiscard: (paths: string[]) => emit('discard', paths)
          })
        )
      ])
    }

    return () => {
      const node = props.node

      if (!node.isDirectory) {
        return h('div', { class: 'git-tree-node' }, [renderFileRow(node, props.depth)])
      }

      const compression = analyzeSingleBranchCompression(toCompressibleNode(node))
      if (compression) {
        const childDepth = props.depth + 1
        return h('div', { class: 'git-tree-node' }, [
          renderCompressedPrefix(compression.prefixLabel, props.depth, node),
          ...compression.items.map((item) => {
            const childNode = findNodeInTree(node, item.path)
            if (!childNode) return null
            if (childNode.isDirectory) {
              return h(GitTreeNode, {
                key: childNode.path,
                node: childNode,
                depth: childDepth,
                selectedFile: props.selectedFile,
                scope: props.scope,
                isExpanded: props.isExpanded,
                onToggleDir: (p: string) => emit('toggleDir', p),
                onSelect: (p: string) => emit('select', p),
                onStage: (paths: string[]) => emit('stage', paths),
                onUnstage: (paths: string[]) => emit('unstage', paths),
                onDiscard: (paths: string[]) => emit('discard', paths)
              })
            }
            return renderFileRow(childNode, childDepth)
          })
        ])
      }

      return renderDirRow(node, props.depth)
    }
  }
})
