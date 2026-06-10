import './assets/main.css'
import 'element-plus/dist/index.css'
import 'markstream-vue/index.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { preloadCodeBlockRuntime } from 'markstream-vue'
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

settingsStore.fetchSettings()
agentStore.fetchAgents()
chatStore.initAgentEventListener()
preloadCodeBlockRuntime()

app.mount('#app')
