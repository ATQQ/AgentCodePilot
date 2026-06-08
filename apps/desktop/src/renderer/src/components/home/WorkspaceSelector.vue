<script setup lang="ts">
import { ref } from 'vue'

const selected = ref('')

const workspaces = [
  { value: '/projects/my-app', label: 'my-app' },
  { value: '/projects/backend', label: 'backend' }
]
</script>

<template>
  <el-select v-model="selected" size="small" placeholder="Select workspace" clearable style="width: 160px">
    <el-option
      v-for="ws in workspaces"
      :key="ws.value"
      :label="ws.label"
      :value="ws.value"
    />
  </el-select>
</template>
