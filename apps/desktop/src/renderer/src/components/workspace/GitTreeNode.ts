import { defineComponent, h, type PropType } from 'vue'
import type { PathTreeNode } from '@renderer/utils/pathTree'

export const GitTreeNode = defineComponent({
  name: 'GitTreeNode',
  props: {
    node: { type: Object as PropType<PathTreeNode>, required: true },
    depth: { type: Number, default: 0 },
    selectedFile: { type: String as PropType<string | null>, default: null },
    scope: { type: String as PropType<'unstaged' | 'staged'>, required: true },
    isExpanded: { type: Function as PropType<(path: string) => boolean>, required: true }
  },
  emits: ['toggleDir', 'select', 'stage', 'unstage'],
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
            class: ['tree-row', node.isDirectory ? 'dir' : 'leaf', { active: isActive }],
            style: { paddingLeft: `${8 + props.depth * 14}px` },
            onClick: () => {
              if (node.isDirectory) emit('toggleDir', node.path)
              else if (node.fileMeta) emit('select', node.fileMeta.path)
            }
          },
          [
            node.isDirectory
              ? h('span', { class: 'expand-icon' }, expanded ? '▾' : '▸')
              : h('span', { class: 'expand-spacer' }),
            h('span', { class: 'node-name', title: node.path }, node.name),
            !node.isDirectory && node.fileMeta
              ? h('span', { class: 'file-stat' }, [
                  h('span', { class: 'add' }, `+${node.fileMeta.additions}`),
                  h('span', { class: 'del' }, `-${node.fileMeta.deletions}`)
                ])
              : null,
            !node.isDirectory && props.scope === 'unstaged'
              ? h(
                  'span',
                  {
                    class: 'stage-btn',
                    title: '暂存',
                    onClick: (e: Event) => {
                      e.stopPropagation()
                      emit('stage', node.path)
                    }
                  },
                  '+'
                )
              : null,
            !node.isDirectory && props.scope === 'staged'
              ? h(
                  'span',
                  {
                    class: 'stage-btn unstage',
                    title: '取消暂存',
                    onClick: (e: Event) => {
                      e.stopPropagation()
                      emit('unstage', node.path)
                    }
                  },
                  '−'
                )
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
            onUnstage: (p: string) => emit('unstage', p)
          })
        )
      ])
    }
  }
})
