import { defineComponent, h, type PropType } from 'vue'
import { RefreshLeft, Plus } from '@element-plus/icons-vue'
import type { PathTreeNode } from '@renderer/utils/pathTree'
import { getFileLanguageIconHtml } from '@renderer/utils/fileLanguageIcon'

const actionIconStyle = { width: '14px', height: '14px' }

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
    return () => {
      const node = props.node
      const expanded = node.isDirectory && props.isExpanded(node.path)
      const children = expanded ? node.children : []
      const isActive = !node.isDirectory && props.selectedFile === node.path

      return h('div', { class: 'git-tree-node' }, [
        h(
          'button',
          {
            class: ['file-row', node.isDirectory ? 'dir' : 'leaf', { active: isActive }],
            style: { paddingLeft: `${8 + props.depth * 14}px` },
            onClick: () => {
              if (node.isDirectory) emit('toggleDir', node.path)
              else if (node.fileMeta) emit('select', node.fileMeta.path)
            }
          },
          [
            node.isDirectory
              ? h('span', { class: 'expand-icon' }, expanded ? '▾' : '▸')
              : h('span', {
                  class: 'file-lang-icon',
                  innerHTML: getFileLanguageIconHtml(node.path)
                }),
            h('span', { class: 'file-name', title: node.path }, node.name),
            !node.isDirectory && node.fileMeta
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
            !node.isDirectory && node.fileMeta
              ? h('span', { class: 'file-stat' }, [
                  h('span', { class: 'add' }, `+${node.fileMeta.additions}`),
                  h('span', { class: 'del' }, `-${node.fileMeta.deletions}`)
                ])
              : null
          ]
        ),
        ...children.map((child: PathTreeNode) =>
          h(GitTreeNode, {
            key: child.path,
            node: child,
            depth: props.depth + 1,
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
  }
})
