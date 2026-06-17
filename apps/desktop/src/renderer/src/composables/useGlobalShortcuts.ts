import { onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUiStore } from '@renderer/stores/ui.store'
import { useChatStore } from '@renderer/stores/chat.store'
import { useWorkspaceStore } from '@renderer/stores/workspace.store'
import { useLayoutStore } from '@renderer/stores/layout.store'

export function useGlobalShortcuts(): void {
  const router = useRouter()
  const route = useRoute()
  const uiStore = useUiStore()
  const chatStore = useChatStore()
  const workspaceStore = useWorkspaceStore()
  const layoutStore = useLayoutStore()

  function startNewChat(): void {
    if (route.path === '/chat' && chatStore.activeConversation) {
      workspaceStore.selectProject(chatStore.activeConversation.projectId ?? null)
    }

    chatStore.setActive(null)

    if (route.path !== '/') {
      router.push('/')
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent): void {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return

    const key = e.key.toLowerCase()

    if (layoutStore.homeRouteActive) {
      if (key === 'g' && !e.shiftKey) {
        e.preventDefault()
        uiStore.toggleSearch()
      }
      if (key === 's') {
        e.preventDefault()
        if (route.meta.fullscreen !== true) {
          uiStore.toggleSidebar()
        }
      }
      if (key === 'n') {
        e.preventDefault()
        startNewChat()
      }
      return
    }

    // Backtick ` → toggle terminal
    if (key === '`') {
      e.preventDefault()
      layoutStore.toggleBottomPanel()
      return
    }

    // Cmd+B → toggle extension panel
    if (key === 'b' && !e.shiftKey) {
      e.preventDefault()
      layoutStore.toggleRightPanel()
      return
    }

    // Cmd+Shift+G → review tab
    if (key === 'g' && e.shiftKey) {
      e.preventDefault()
      layoutStore.openExtensionTab('review')
      return
    }

    if (key === 'g' && !e.shiftKey) {
      e.preventDefault()
      uiStore.toggleSearch()
      return
    }

    // Cmd+P → files tab
    if (key === 'p') {
      e.preventDefault()
      layoutStore.openExtensionTab('files')
      return
    }

    // Cmd+T → browser tab
    if (key === 't') {
      e.preventDefault()
      layoutStore.openExtensionTab('browser')
      return
    }

    if (key === 's') {
      e.preventDefault()
      if (route.meta.fullscreen !== true) {
        uiStore.toggleSidebar()
      }
      return
    }

    if (key === 'n') {
      e.preventDefault()
      startNewChat()
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleGlobalKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleGlobalKeydown)
  })
}
