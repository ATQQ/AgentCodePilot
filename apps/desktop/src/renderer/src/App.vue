<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from './components/layout/AppShell.vue'

const route = useRoute()
const isFullscreenPage = computed(() => route.meta.fullscreen === true)
</script>

<template>
  <AppShell v-if="!isFullscreenPage" />
  <router-view v-else />
</template>
