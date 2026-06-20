<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { REVEAL_APP, REVEAL_APP_ID } from '@renderer/constants/externalApps'
import ExternalAppIcon from '@renderer/components/common/ExternalAppIcon.vue'
import type { ExternalAppDefinition } from '@renderer/types'

const props = defineProps<{
  path: string
}>()

const { t } = useI18n()
const settingsStore = useSettingsStore()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const defaultAppId = computed(() => settingsStore.getResolvedDefaultAppId())

const defaultApp = computed(() => settingsStore.findAppById(defaultAppId.value))

const menuApps = computed(() => settingsStore.getMergedExternalApps())

const showRevealReset = computed(() => defaultAppId.value !== REVEAL_APP_ID)

function toggleMenu(): void {
  open.value = !open.value
}

function closeMenu(): void {
  open.value = false
}

function toastOpenFailure(app: ExternalAppDefinition): void {
  ElMessage.warning(t('env.openFailedNotInstalled', { app: app.name }))
}

async function executeOpen(app: ExternalAppDefinition): Promise<void> {
  if (!props.path) return
  try {
    const result = await window.agentAPI.shell.openPath({
      path: props.path,
      kind: app.kind,
      protocol: app.protocol,
      appName: app.name
    })
    if (!result.success) {
      if (result.error === 'NOT_INSTALLED') {
        toastOpenFailure(app)
      } else {
        ElMessage.error(result.message || t('env.openFailed'))
      }
    }
  } catch {
    toastOpenFailure(app)
  }
}

async function openDefault(): Promise<void> {
  const app = defaultApp.value
  if (!app) return
  await executeOpen(app)
}

async function selectAndOpen(app: ExternalAppDefinition): Promise<void> {
  closeMenu()
  await executeOpen(app)
  void settingsStore.setDefaultExternalApp(app.id)
}

async function selectApp(app: ExternalAppDefinition): Promise<void> {
  await selectAndOpen(app)
}

async function resetToReveal(): Promise<void> {
  await selectAndOpen(REVEAL_APP)
}

function onClickOutside(e: MouseEvent): void {
  if (!open.value) return
  const target = e.target as Node
  if (rootRef.value && !rootRef.value.contains(target)) {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutside)
})
</script>

<template>
  <div ref="rootRef" class="open-path-menu">
    <div class="open-split">
      <button class="open-main" type="button" @click="openDefault">
        <ExternalAppIcon :app-id="defaultAppId" :icon-url="defaultApp?.iconUrl" :icon-svg="defaultApp?.iconSvg" />
        <span class="open-label">{{ t('env.open') }}</span>
      </button>
      <button
        class="open-chevron-btn"
        type="button"
        :aria-expanded="open"
        :title="t('env.openMenu')"
        @click.stop="toggleMenu"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
    </div>

    <div v-if="open" class="open-dropdown">
      <button
        v-for="app in menuApps"
        :key="app.id"
        class="open-item"
        type="button"
        @click.stop="selectApp(app)"
      >
        <ExternalAppIcon
          :app-id="app.id"
          :icon-url="app.iconUrl"
          :icon-svg="app.iconSvg"
        />
        <span class="open-item-name">{{ app.name }}</span>
        <span v-if="app.id === defaultAppId" class="open-item-badge">
          {{ t('env.defaultApp') }}
        </span>
      </button>

      <template v-if="showRevealReset">
        <div class="open-divider" />

        <button class="open-item open-item-footer" type="button" @click.stop="resetToReveal">
          <ExternalAppIcon app-id="reveal" />
          <span>{{ t('env.revealInFolder') }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.open-path-menu {
  position: relative;
  flex-shrink: 0;
}

.open-split {
  display: inline-flex;
  align-items: stretch;
  height: 28px;
  border: 1px solid var(--sidebar-border);
  border-radius: 999px;
  overflow: hidden;
  background: var(--content-bg);
}

.open-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 0 8px;
  border: none;
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.open-main:hover {
  background: var(--sidebar-item-hover);
}

.open-chevron-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  padding: 0;
  border: none;
  border-left: 1px solid var(--sidebar-border);
  background: transparent;
  color: var(--content-text-secondary);
  cursor: pointer;
}

.open-chevron-btn:hover {
  background: var(--sidebar-item-hover);
  color: var(--content-text);
}

.open-label {
  white-space: nowrap;
}

.open-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 200px;
  padding: 4px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  background: var(--content-bg);
  box-shadow: var(--shadow-md);
  z-index: 4000;
}

.open-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.open-item:hover {
  background: var(--sidebar-item-hover);
}

.open-item-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.open-item-badge {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  color: var(--content-text-tertiary);
}

.open-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--sidebar-border);
}

.open-item-footer {
  font-weight: 500;
}
</style>
