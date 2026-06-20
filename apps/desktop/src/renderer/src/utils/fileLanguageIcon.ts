import { getLanguageIcon, resolveMonacoLanguageId } from 'markstream-vue'
import { getLanguageFromPath } from '@renderer/utils/monaco'

export function getFileLanguageIconHtml(filePath: string): string {
  const lang = getLanguageFromPath(filePath)
  const id = resolveMonacoLanguageId(lang) || lang
  return getLanguageIcon(id) || ''
}
