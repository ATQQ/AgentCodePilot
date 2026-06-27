import { defineComponent, h, type PropType, type VNode } from 'vue'
import { RefreshLeft, Plus } from '@element-plus/icons-vue'
import type { PathTreeNode } from '@renderer/utils/pathTree'
import {
  analyzeSingleBranchCompression,
  type CompressibleTreeNode
} from '@renderer/utils/treeCompression'
import { getFileLanguageIconHtml } from '@renderer/utils/fileLanguageIcon'

const actionIconStyle = { width: '14px', height: '14px' }

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
    function renderCompressedPrefix(label: string, depth: number): VNode {
      return h(
        'div',
        {
          class: 'compressed-path-row',
          style: { paddingLeft: `${8 + depth * 14}px` },
          title: label
        },
        [h('span', { class: 'compressed-path-label' }, label)]
      )
    }

    function renderFileRow(node: PathTreeNode, depth: number): VNode {
      const isActive = props.selectedFile === node.path
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
          node.fileMeta
            ? h('span', { class: 'file-actions' }, [
                props.scope === 'unstaged'
                  ? h(
                      'button',
                      {
                        type: 'button',
                        class: 'action-btn discard',
                        title: '放弃更改',
                        onClick: (e: Event) => {
                          e.stopPropagation()
                          emit('discard', node.path)
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
                        title: '暂存',
                        onClick: (e: Event) => {
                          e.stopPropagation()
                          emit('stage', node.path)
                        }
                      },
                      [h(Plus, { style: actionIconStyle })]
                    )
                  : h(
                      'button',
                      {
                        type: 'button',
                        class: 'action-btn unstage',
                        title: '取消暂存',
                        onClick: (e: Event) => {
                          e.stopPropagation()
                          emit('unstage', node.path)
                        }
                      },
                      '−'
                    )
              ])
            : null,
          node.fileMeta
            ? h('span', { class: 'file-stat' }, [
                h('span', { class: 'add' }, `+${node.fileMeta.additions}`),
                h('span', { class: 'del' }, `-${node.fileMeta.deletions}`)
              ])
            : null
        ]
      )
    }

    function renderDirRow(node: PathTreeNode, depth: number): VNode {
      const expanded = props.isExpanded(node.path)
      const children = expanded ? node.children : []
      const isActive = false

      return h('div', { class: 'git-tree-node' }, [
        h(
          'button',
          {
            class: ['file-row', 'dir', { active: isActive }],
            style: { paddingLeft: `${8 + depth * 14}px` },
            onClick: () => emit('toggleDir', node.path)
          },
          [
            h('span', { class: 'expand-icon' }, expanded ? '▾' : '▸'),
            h('span', { class: 'file-name', title: node.path }, node.name)
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
            onStage: (p: string) => emit('stage', p),
            onUnstage: (p: string) => emit('unstage', p),
            onDiscard: (p: string) => emit('discard', p)
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
          renderCompressedPrefix(compression.prefixLabel, props.depth),
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
                onStage: (p: string) => emit('stage', p),
                onUnstage: (p: string) => emit('unstage', p),
                onDiscard: (p: string) => emit('discard', p)
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
