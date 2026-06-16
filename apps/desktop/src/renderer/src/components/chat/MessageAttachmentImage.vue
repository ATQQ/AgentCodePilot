<script setup lang="ts">
import { ref, watch } from 'vue'
import { toLocalFileUrl } from '@renderer/utils/localFile'
import { useImagePreview } from '@renderer/composables/useImagePreview'

const props = defineProps<{
  path: string
  name: string
  title?: string
}>()

const { openImagePreview } = useImagePreview()

const src = ref(toLocalFileUrl(props.path))
const failed = ref(false)

async function handleError(): Promise<void> {
  if (failed.value) return
  failed.value = true
  const dataUrl = await window.agentAPI.file.getImageDataUrl(props.path)
  if (dataUrl) {
    src.value = dataUrl
  }
}

function handleClick(): void {
  openImagePreview({
    name: props.name,
    path: props.path,
    previewUrl: src.value
  })
}

watch(
  () => props.path,
  (path) => {
    failed.value = false
    src.value = toLocalFileUrl(path)
  }
)
</script>

<template>
  <button type="button" class="msg-attachment-image-btn" :title="title" @click="handleClick">
    <img class="msg-attachment-img" :src="src" :alt="name" @error="handleError" />
  </button>
</template>

<style scoped>
.msg-attachment-image-btn {
  display: inline-flex;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-md);
}

.msg-attachment-image-btn:hover .msg-attachment-img {
  opacity: 0.85;
}

.msg-attachment-img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: block;
}
</style>
