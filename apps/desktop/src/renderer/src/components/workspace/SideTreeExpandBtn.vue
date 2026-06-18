<script setup lang="ts">
import SideTreeFolderBtn from './SideTreeFolderBtn.vue'

defineEmits<{
  expand: []
}>()
</script>

<template>
  <SideTreeFolderBtn
    title="展开文件树"
    floating
    @click="$emit('expand')"
  />
</template>
