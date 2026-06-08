<script setup lang="ts">
import { ref } from 'vue'

const selected = ref('claude-code')

const agents = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'gemini-cli', label: 'Gemini CLI' }
]
</script>

<template>
  <el-select v-model="selected" size="small" style="width: 140px">
    <el-option
      v-for="agent in agents"
      :key="agent.value"
      :label="agent.label"
      :value="agent.value"
    />
  </el-select>
</template>
