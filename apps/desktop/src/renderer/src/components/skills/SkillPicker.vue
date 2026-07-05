<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ScannedSkill, SkillReference } from '@renderer/types'
import { usePanelContextStore } from '@renderer/stores/panelContext.store'

const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  select: [skill: SkillReference]
  loaded: []
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

const tooltip = ref<{
  text: string
  top: number
  left: number
} | null>(null)

async function loadSkills(): Promise<void> {
  loading.value = true
  try {
    skills.value = await window.agentAPI.skills.scan(panelContext.effectivePanelCwd)
  } finally {
    loading.value = false
    emit('loaded')
  }
}

watch(
  () => props.active,
  (active) => {
    if (active) {
      query.value = ''
      void loadSkills()
    } else {
      tooltip.value = null
    }
  },
  { immediate: true }
)

function selectSkill(skill: ScannedSkill): void {
  emit('select', {
    name: skill.name,
    path: skill.path,
    scope: skill.scope
  })
}

function showTooltip(event: MouseEvent, skill: ScannedSkill): void {
  const desc = skill.description?.trim()
  if (!desc) {
    tooltip.value = null
    return
  }

  const target = event.currentTarget as HTMLElement
  const descEl = target.querySelector('.skill-desc') as HTMLElement | null
  const isTruncated = descEl ? descEl.scrollWidth > descEl.clientWidth : desc.length > 48
  if (!isTruncated) {
    tooltip.value = null
    return
  }

  const rect = target.getBoundingClientRect()
  tooltip.value = {
    text: desc,
    top: rect.top + rect.height / 2,
    left: rect.right + 8
  }
}

function hideTooltip(): void {
  tooltip.value = null
}
</script>

<template>
  <div class="skill-submenu-panel" @mouseleave="hideTooltip">
    <input
      v-model="query"
      class="search-input"
      :placeholder="t('composer.skillPicker.searchPlaceholder')"
      @click.stop
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
          @mouseenter="showTooltip($event, skill)"
          @mouseleave="hideTooltip"
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
          @mouseenter="showTooltip($event, skill)"
          @mouseleave="hideTooltip"
        >
          <span class="skill-name">{{ skill.name }}</span>
          <span v-if="skill.description" class="skill-desc">{{ skill.description }}</span>
        </button>
      </template>
    </div>

    <Teleport to="body">
      <div
        v-if="tooltip"
        class="skill-desc-tooltip"
        :style="{ top: `${tooltip.top}px`, left: `${tooltip.left}px` }"
      >
        {{ tooltip.text }}
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.skill-submenu-panel {
  display: flex;
  flex-direction: column;
  min-width: 280px;
  max-width: 320px;
  min-height: 120px;
  max-height: min(420px, calc(100vh - 120px));
  overflow: hidden;
}

.search-input {
  margin: 6px 8px 4px;
  padding: 5px 8px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-xs);
}

.search-input:focus {
  outline: none;
  border-color: var(--composer-border-focus);
}

.picker-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 0 6px;
}

.group-label {
  padding: 6px 12px 2px;
  font-size: 10px;
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
  padding: 7px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.skill-item:hover {
  background: var(--btn-ghost-hover);
}

.skill-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--content-text);
  line-height: 1.3;
}

.skill-desc {
  width: 100%;
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-empty {
  padding: 20px 12px;
  text-align: center;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-sm);
}
</style>

<style>
.skill-desc-tooltip {
  position: fixed;
  z-index: 10001;
  max-width: 320px;
  padding: 8px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--content-bg);
  box-shadow: var(--shadow-md);
  color: var(--content-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.45;
  pointer-events: none;
  transform: translateY(-50%);
}
</style>
