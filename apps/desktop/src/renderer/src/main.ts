import './assets/main.css'
import 'element-plus/dist/index.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { setupMarkstream } from './markstream-setup'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { useSettingsStore } from './stores/settings.store'
import { useAgentStore } from './stores/agent.store'
import { useChatStore } from './stores/chat.store'

const pinia = createPinia()
const app = createApp(App)

app.use(pinia).use(router).use(ElementPlus).use(i18n)

const settingsStore = useSettingsStore()
const agentStore = useAgentStore()
const chatStore = useChatStore()

import { useWorkspaceStore } from './stores/workspace.store'
const workspaceStore = useWorkspaceStore()

settingsStore.fetchSettings()
agentStore.fetchAgents()
workspaceStore.loadProjects().then(() => {
  chatStore.loadConversations()
})
chatStore.initAgentEventListener()
setupMarkstream()

app.mount('#app')
