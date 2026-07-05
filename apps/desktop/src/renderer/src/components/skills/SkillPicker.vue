<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ScannedSkill, SkillReference } from '@renderer/types'
import { usePanelContextStore } from '@renderer/stores/panelContext.store'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  select: [skill: SkillReference]
}>()

const { t } = useI18n()
const panelContext = usePanelContextStore()
const skills = ref<ScannedSkill[]>([])
const loading = ref(false)
const query = ref('')

const workspaceSkills = computed(() => skills.value.filter((s) => s.scope === 'workspace'))
const globalSkills = computed(() => skills.value.filter((s) => s.scope === 'global'))

function matchesQuery(skill: ScannedSkill): boolean {
  const q = query.value.trim().toLowerCase()
  if (!q) return true
  return (
    skill.name.toLowerCase().includes(q) ||
    skill.description.toLowerCase().includes(q) ||
    skill.path.toLowerCase().includes(q)
  )
}

const filteredWorkspaceSkills = computed(() => workspaceSkills.value.filter(matchesQuery))
const filteredGlobalSkills = computed(() => globalSkills.value.filter(matchesQuery))

async function loadSkills(): Promise<void> {
  loading.value = true
  try {
    skills.value = await window.agentAPI.skills.scan(panelContext.effectivePanelCwd)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      query.value = ''
      void loadSkills()
    }
  }
)

function selectSkill(skill: ScannedSkill): void {
  emit('select', {
    name: skill.name,
    path: skill.path,
    scope: skill.scope
  })
}
</script>

<template>
  <div v-if="visible" class="skill-picker-overlay" @click.self="emit('close')">
    <div class="skill-picker">
      <div class="picker-header">
        <span class="picker-title">{{ t('composer.addMenu.referenceSkill') }}</span>
        <button type="button" class="close-btn" @click="emit('close')">×</button>
      </div>

      <input
        v-model="query"
        class="search-input"
        :placeholder="t('composer.skillPicker.searchPlaceholder')"
      />

      <div v-if="loading" class="picker-empty">{{ t('composer.skillPicker.loading') }}</div>
      <div
        v-else-if="filteredWorkspaceSkills.length === 0 && filteredGlobalSkills.length === 0"
        class="picker-empty"
      >
        {{ t('composer.skillPicker.empty') }}
      </div>
      <div v-else class="picker-list elegant-scroll">
        <template v-if="filteredWorkspaceSkills.length">
          <div class="group-label">{{ t('composer.skillPicker.workspaceGroup') }}</div>
          <button
            v-for="skill in filteredWorkspaceSkills"
            :key="skill.id"
            type="button"
            class="skill-item"
            @click="selectSkill(skill)"
          >
            <span class="skill-name">{{ skill.name }}</span>
            <span v-if="skill.description" class="skill-desc">{{ skill.description }}</span>
          </button>
        </template>

        <template v-if="filteredGlobalSkills.length">
          <div class="group-label">{{ t('composer.skillPicker.globalGroup') }}</div>
          <button
            v-for="skill in filteredGlobalSkills"
            :key="skill.id"
            type="button"
            class="skill-item"
            @click="selectSkill(skill)"
          >
            <span class="skill-name">{{ skill.name }}</span>
            <span v-if="skill.description" class="skill-desc">{{ skill.description }}</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skill-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--content-bg) 35%, transparent);
}

.skill-picker {
  width: min(420px, calc(100vw - 32px));
  max-height: min(520px, calc(100vh - 64px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--content-bg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--sidebar-border);
}

.picker-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--content-text);
}

.close-btn {
  border: none;
  background: transparent;
  color: var(--content-text-secondary);
  font-size: 18px;
  cursor: pointer;
}

.search-input {
  margin: 10px 12px 0;
  padding: 6px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-xs);
}

.picker-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 0 12px;
}

.group-label {
  padding: 8px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--content-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.skill-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.skill-item:hover {
  background: var(--sidebar-item-hover);
}

.skill-name {
  font-size: var(--font-size-sm);
  color: var(--content-text);
}

.skill-desc {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  line-height: 1.4;
}

.picker-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-sm);
}
</style>
