import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Attachment } from '@renderer/types'

export interface ComposerInsertRequest {
  id: string
  text?: string
  attachment?: Attachment
}

export const useComposerStore = defineStore('composer', () => {
  const pendingInsert = ref<ComposerInsertRequest | null>(null)

  function insertText(text: string): void {
    pendingInsert.value = { id: `ins-${Date.now()}`, text }
  }

  function addAttachment(attachment: Attachment): void {
    pendingInsert.value = { id: `ins-${Date.now()}`, attachment }
  }

  function addFileReference(path: string, startLine?: number, endLine?: number): void {
    const lineRef =
      startLine !== undefined
        ? endLine !== undefined && endLine !== startLine
          ? `@${path}:${startLine}-${endLine}`
          : `@${path}:${startLine}`
        : `@${path}`
    insertText(`\n${lineRef}\n`)
  }

  function consumeInsert(): ComposerInsertRequest | null {
    const req = pendingInsert.value
    pendingInsert.value = null
    return req
  }

  return {
    pendingInsert,
    insertText,
    addAttachment,
    addFileReference,
    consumeInsert
  }
})
