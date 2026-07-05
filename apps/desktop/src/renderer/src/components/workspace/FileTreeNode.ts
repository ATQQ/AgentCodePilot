import { defineComponent, h, type PropType, type VNode } from 'vue'
import type { FileEntry, GitChangeType } from '@renderer/types'
import { analyzeFileEntryCompression } from '@renderer/utils/treeCompression'
import { getFileLanguageIconHtml } from '@renderer/utils/fileLanguageIcon'

function toFileEntry(item: { name: string; path: string; isDirectory: boolean }): FileEntry {
  return {
    name: item.name,
    path: item.path,
    relativePath: item.path,
    isDirectory: item.isDirectory
  }
}

export const FileTreeNode = defineComponent({
  name: 'FileTreeNode',
  props: {
    entry: { type: Object as PropType<FileEntry>, required: true },
    depth: { type: Number, default: 0 },
    getItems: { type: Function as PropType<(dir: string) => FileEntry[]>, required: true },
    isExpanded: { type: Function as PropType<(dir: string) => boolean>, required: true },
    activeFilePath: { type: String as PropType<string | null>, default: null },
    getGitChangeType: {
      type: Function as PropType<(relativePath: string) => GitChangeType | undefined>,
      default: undefined
    }
  },
  emits: ['clickEntry', 'contextMenu'],
  setup(props, { emit }) {
    function resolveCompressedItems(
      compression: NonNullable<ReturnType<typeof analyzeFileEntryCompression>>
    ): FileEntry[] {
      const cached = props.getItems(compression.terminalDirPath)
      return compression.items.map((item) => {
        return cached.find((entry) => entry.path === item.path) ?? toFileEntry(item)
      })
    }

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

    function gitClassForEntry(entry: FileEntry): string | undefined {
      if (entry.isDirectory) return undefined
      const changeType = props.getGitChangeType?.(entry.relativePath)
      if (!changeType) return undefined
      return `git-${changeType}`
    }

    function renderFileRow(entry: FileEntry, depth: number): VNode {
      const gitClass = gitClassForEntry(entry)
      return h(
        'button',
        {
          class: ['file-row', 'leaf', { active: props.activeFilePath === entry.path }, gitClass],
          style: { paddingLeft: `${8 + depth * 14}px` },
          onClick: () => emit('clickEntry', entry),
          onContextmenu: (e: MouseEvent) => emit('contextMenu', e, entry)
        },
        [
          h('span', {
            class: 'file-lang-icon',
            innerHTML: getFileLanguageIconHtml(entry.path)
          }),
          h('span', { class: 'file-name', title: entry.relativePath }, entry.name)
        ]
      )
    }

    function renderDirRow(entry: FileEntry, depth: number): VNode {
      const expanded = props.isExpanded(entry.path)
      const children = expanded ? props.getItems(entry.path) : []

      return h('div', { class: 'file-tree-node' }, [
        h(
          'button',
          {
            class: ['file-row', 'dir'],
            style: { paddingLeft: `${8 + depth * 14}px` },
            onClick: () => emit('clickEntry', entry),
            onContextmenu: (e: MouseEvent) => emit('contextMenu', e, entry)
          },
          [
            h('span', { class: 'expand-icon' }, expanded ? '▾' : '▸'),
            h('span', { class: 'file-name', title: entry.relativePath }, entry.name)
          ]
        ),
        ...children.map((child: FileEntry) =>
          h(FileTreeNode, {
            key: child.path,
            entry: child,
            depth: depth + 1,
            getItems: props.getItems,
            isExpanded: props.isExpanded,
            activeFilePath: props.activeFilePath,
            getGitChangeType: props.getGitChangeType,
            onClickEntry: (e: FileEntry) => emit('clickEntry', e),
            onContextMenu: (e: MouseEvent, f: FileEntry) => emit('contextMenu', e, f)
          })
        )
      ])
    }

    return () => {
      const entry = props.entry

      if (!entry.isDirectory) {
        return h('div', { class: 'file-tree-node' }, [renderFileRow(entry, props.depth)])
      }

      const compression = analyzeFileEntryCompression(entry, props.getItems, props.isExpanded)

      if (compression) {
        const childDepth = props.depth + 1
        const childEntries = resolveCompressedItems(compression)

        return h('div', { class: 'file-tree-node' }, [
          renderCompressedPrefix(compression.prefixLabel, props.depth),
          ...childEntries.map((childEntry) => {
            if (childEntry.isDirectory) {
              return h(FileTreeNode, {
                key: childEntry.path,
                entry: childEntry,
                depth: childDepth,
                getItems: props.getItems,
                isExpanded: props.isExpanded,
                activeFilePath: props.activeFilePath,
                getGitChangeType: props.getGitChangeType,
                onClickEntry: (e: FileEntry) => emit('clickEntry', e),
                onContextMenu: (e: MouseEvent, f: FileEntry) => emit('contextMenu', e, f)
              })
            }

            return renderFileRow(childEntry, childDepth)
          })
        ])
      }

      return renderDirRow(entry, props.depth)
    }
  }
})
