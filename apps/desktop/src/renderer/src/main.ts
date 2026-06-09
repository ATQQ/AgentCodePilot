import './assets/main.css'
import 'element-plus/dist/index.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { useSettingsStore } from './stores/settings.store'

const pinia = createPinia()
const app = createApp(App)

app.use(pinia).use(router).use(ElementPlus).use(i18n)

useSettingsStore()

app.mount('#app')
