import { ref } from 'vue'

export interface ImagePreviewOptions {
  name: string
  path?: string
  previewUrl?: string
}

const visible = ref(false)
const previewName = ref('')
const previewPath = ref<string | undefined>()
const previewUrl = ref<string | undefined>()

export function useImagePreview() {
  function openImagePreview(options: ImagePreviewOptions): void {
    previewName.value = options.name
    previewPath.value = options.path
    previewUrl.value = options.previewUrl
    visible.value = true
  }

  function closeImagePreview(): void {
    visible.value = false
  }

  return {
    visible,
    previewName,
    previewPath,
    previewUrl,
    openImagePreview,
    closeImagePreview
  }
}
