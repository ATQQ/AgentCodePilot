<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="placeholder-view">
    <el-empty :description="`${String(route.name)} — coming soon`" />
  </div>
</template>

<style scoped>
.placeholder-view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
