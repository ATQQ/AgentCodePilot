import { computed, type ComputedRef } from 'vue'
import { useBrowserStore } from '@renderer/stores/browser.store'
import { useLayoutStore } from '@renderer/stores/layout.store'
import { usePanelContextStore } from '@renderer/stores/panelContext.store'
import { normalizeBrowserUrl } from '@renderer/utils/extractUrls'

export function useBrowserPreview(): {
  htmlBaseDirs: ComputedRef<string[]>
  openInBrowser: (raw: string, baseDirs?: string[]) => void
} {
  const browserStore = useBrowserStore()
  const layoutStore = useLayoutStore()
  const panelContextStore = usePanelContextStore()

  const htmlBaseDirs = computed(() =>
    panelContextStore.availableFolders.length
      ? panelContextStore.availableFolders.map((folder) => folder.path)
      : panelContextStore.effectivePanelCwd
        ? [panelContextStore.effectivePanelCwd]
        : []
  )

  function openInBrowser(raw: string, baseDirs = htmlBaseDirs.value): void {
    const url = normalizeBrowserUrl(raw, { htmlBaseDirs: baseDirs })
    if (!url) return
    browserStore.setCurrentUrl(url)
    layoutStore.openExtensionTab('browser')
  }

  return {
    htmlBaseDirs,
    openInBrowser
  }
}
