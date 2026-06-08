<script setup lang="ts">
import { ref } from 'vue'

const selected = ref('claude-sonnet-4')

const models = [
  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4', label: 'Claude Opus 4' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
]
</script>

<template>
  <el-select v-model="selected" size="small" style="width: 160px">
    <el-option
      v-for="model in models"
      :key="model.value"
      :label="model.label"
      :value="model.value"
    />
  </el-select>
</template>
