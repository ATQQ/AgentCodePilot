import './assets/main.css'
import 'element-plus/es/components/message/style/css'
import '@renderer/utils/monacoWorkers'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { setupMarkstreamCore } from './markstream-setup'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { useSettingsStore } from './stores/settings.store'
import { useAgentStore } from './stores/agent.store'
import { useModelStore } from './stores/model.store'
import { useChatStore } from './stores/chat.store'

const pinia = createPinia()
const app = createApp(App)

app.use(pinia).use(router).use(i18n)

const settingsStore = useSettingsStore()
const agentStore = useAgentStore()
const modelStore = useModelStore()
const chatStore = useChatStore()

import { useWorkspaceStore } from './stores/workspace.store'
const workspaceStore = useWorkspaceStore()

settingsStore.fetchSettings()
agentStore.fetchAgents()
modelStore.fetchCatalog('claude-code')
workspaceStore.loadProjects().then(() => {
  chatStore.loadConversations()
})
chatStore.initAgentEventListener()
chatStore.initApprovalNavigateListener()
setupMarkstreamCore()

app.mount('#app')
