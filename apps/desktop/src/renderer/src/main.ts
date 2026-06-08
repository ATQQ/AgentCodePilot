import './assets/main.css'
import 'element-plus/dist/index.css'

import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import './composables/useTheme'

createApp(App).use(router).use(ElementPlus).use(i18n).mount('#app')
