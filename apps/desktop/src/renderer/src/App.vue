<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from './components/layout/AppShell.vue'
import ImagePreviewOverlay from './components/common/ImagePreviewOverlay.vue'
import { useGlobalShortcuts } from './composables/useGlobalShortcuts'

const route = useRoute()
const isFullscreenPage = computed(() => route.meta.fullscreen === true)

useGlobalShortcuts()
</script>

<template>
  <AppShell v-if="!isFullscreenPage" />
  <router-view v-else />
  <ImagePreviewOverlay />
</template>
