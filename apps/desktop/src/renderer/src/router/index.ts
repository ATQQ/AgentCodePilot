import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@renderer/views/HomeView.vue')
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('@renderer/views/ChatView.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@renderer/views/SettingsView.vue')
    }
  ]
})

export default router
