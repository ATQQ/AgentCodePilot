<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useImagePreview } from '@renderer/composables/useImagePreview'
import { toLocalFileUrl } from '@renderer/utils/localFile'

const { t } = useI18n()
const { visible, previewName, previewPath, previewUrl, closeImagePreview } = useImagePreview()

const src = ref('')
const failed = ref(false)

async function resolveSrc(): Promise<void> {
  failed.value = false
  if (previewUrl.value) {
    src.value = previewUrl.value
    return
  }
  if (previewPath.value) {
    src.value = toLocalFileUrl(previewPath.value)
    return
  }
  src.value = ''
}

async function handleImageError(): Promise<void> {
  if (failed.value || !previewPath.value) return
  failed.value = true
  const dataUrl = await window.agentAPI.file.getImageDataUrl(previewPath.value)
  if (dataUrl) {
    src.value = dataUrl
  }
}

function handleBackdropClick(): void {
  closeImagePreview()
}

function handleKeydown(e: KeyboardEvent): void {
  if (!visible.value || e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  closeImagePreview()
}

watch(
  () => [visible.value, previewPath.value, previewUrl.value] as const,
  ([open]) => {
    if (open) {
      void resolveSrc()
    } else {
      src.value = ''
      failed.value = false
    }
  }
)

onMounted(() => {
  document.addEventListener('keydown', handleKeydown, true)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="image-preview-fade">
      <div
        v-if="visible"
        class="image-preview-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="previewName"
        @click="handleBackdropClick"
      >
        <div class="image-preview-panel" @click.stop>
          <button
            type="button"
            class="image-preview-close"
            :title="t('chat.closePreview')"
            @click="closeImagePreview"
          >
            &times;
          </button>
          <img
            v-if="src"
            class="image-preview-img"
            :src="src"
            :alt="previewName"
            @error="handleImageError"
          />
          <div v-if="previewName" class="image-preview-caption">{{ previewName }}</div>
          <div class="image-preview-hint">{{ t('chat.closePreviewHint') }}</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.image-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(4px);
}

.image-preview-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: min(92vw, 1200px);
  max-height: 92vh;
}

.image-preview-close {
  position: absolute;
  top: -40px;
  right: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.image-preview-close:hover {
  background: rgba(255, 255, 255, 0.22);
}

.image-preview-img {
  max-width: min(92vw, 1200px);
  max-height: calc(92vh - 64px);
  object-fit: contain;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  background: rgba(255, 255, 255, 0.04);
}

.image-preview-caption {
  max-width: min(92vw, 720px);
  color: rgba(255, 255, 255, 0.92);
  font-size: var(--font-size-sm);
  text-align: center;
  word-break: break-all;
}

.image-preview-hint {
  color: rgba(255, 255, 255, 0.55);
  font-size: var(--font-size-xs);
}

.image-preview-fade-enter-active,
.image-preview-fade-leave-active {
  transition: opacity 0.18s ease;
}

.image-preview-fade-enter-from,
.image-preview-fade-leave-to {
  opacity: 0;
}
</style>
