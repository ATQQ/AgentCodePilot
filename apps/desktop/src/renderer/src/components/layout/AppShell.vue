<script setup lang="ts">
import AppSidebar from './AppSidebar.vue'
import TopBar from './TopBar.vue'
</script>

<template>
  <div class="app-shell">
    <AppSidebar />
    <div class="main-content">
      <TopBar />
      <div class="page-content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fafafa;
}

.page-content {
  flex: 1;
  overflow: auto;
}
</style>
