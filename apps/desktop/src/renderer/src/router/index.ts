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
      path: '/skills',
      name: 'skills',
      component: () => import('@renderer/views/PlaceholderView.vue')
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('@renderer/views/PlaceholderView.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@renderer/views/SettingsView.vue'),
      meta: { fullscreen: true }
    }
  ]
})

export default router
