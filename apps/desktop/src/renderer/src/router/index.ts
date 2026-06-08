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
      path: '/search',
      name: 'search',
      component: () => import('@renderer/views/PlaceholderView.vue')
    },
    {
      path: '/skills',
      name: 'skills',
      component: () => import('@renderer/views/PlaceholderView.vue')
    },
    {
      path: '/plugins',
      name: 'plugins',
      component: () => import('@renderer/views/PlaceholderView.vue')
    },
    {
      path: '/automations',
      name: 'automations',
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
      component: () => import('@renderer/views/SettingsView.vue')
    }
  ]
})

export default router
