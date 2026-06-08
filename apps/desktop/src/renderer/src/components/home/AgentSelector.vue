<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const selected = ref('custom-high')

const options = [
  { value: 'custom-high', label: `${t('composer.agent')} ${t('composer.high')}` },
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'gemini-cli', label: 'Gemini CLI' }
]

const currentLabel = () => options.find(o => o.value === selected.value)?.label || ''
</script>

<template>
  <div class="agent-selector">
    <el-dropdown trigger="click" @command="(v: string) => selected = v">
      <button class="agent-btn">
        <span>{{ currentLabel() }}</span>
        <span class="chevron">&#x25BE;</span>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="opt in options"
            :key="opt.value"
            :command="opt.value"
          >
            {{ opt.label }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped>
.agent-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.agent-btn:hover {
  background: var(--btn-ghost-hover);
}

.chevron {
  font-size: 10px;
  opacity: 0.5;
}
</style>
