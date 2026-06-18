import { defineComponent, h, type PropType } from 'vue'
import type { FileEntry } from '@renderer/types'
import { getFileLanguageIconHtml } from '@renderer/utils/fileLanguageIcon'

export const FileTreeNode = defineComponent({
  name: 'FileTreeNode',
  props: {
    entry: { type: Object as PropType<FileEntry>, required: true },
    depth: { type: Number, default: 0 },
    getItems: { type: Function as PropType<(dir: string) => FileEntry[]>, required: true },
    isExpanded: { type: Function as PropType<(dir: string) => boolean>, required: true },
    activeFilePath: { type: String as PropType<string | null>, default: null }
  },
  emits: ['clickEntry', 'contextMenu'],
  setup(props, { emit }) {
    return () => {
      const entry = props.entry
      const expanded = entry.isDirectory && props.isExpanded(entry.path)
      const children = expanded ? props.getItems(entry.path) : []

      return h('div', { class: 'file-tree-node' }, [
        h(
          'button',
          {
            class: [
              'file-row',
              entry.isDirectory ? 'dir' : 'leaf',
              { active: !entry.isDirectory && props.activeFilePath === entry.path }
            ],
            style: { paddingLeft: `${8 + props.depth * 14}px` },
            onClick: () => emit('clickEntry', entry),
            onContextmenu: (e: MouseEvent) => emit('contextMenu', e, entry)
          },
          [
            entry.isDirectory
              ? h('span', { class: 'expand-icon' }, expanded ? '▾' : '▸')
              : h('span', {
                  class: 'file-lang-icon',
                  innerHTML: getFileLanguageIconHtml(entry.path)
                }),
            h('span', { class: 'file-name', title: entry.relativePath }, entry.name)
          ]
        ),
        ...children.map((child: FileEntry) =>
          h(FileTreeNode, {
            key: child.path,
            entry: child,
            depth: props.depth + 1,
            getItems: props.getItems,
            isExpanded: props.isExpanded,
            activeFilePath: props.activeFilePath,
            onClickEntry: (e: FileEntry) => emit('clickEntry', e),
            onContextMenu: (e: MouseEvent, f: FileEntry) => emit('contextMenu', e, f)
          })
        )
      ])
    }
  }
})
