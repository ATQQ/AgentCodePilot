import type { ModelCatalogResult } from '../../shared/agent-model'
import { getClaudeModelCatalog, invalidateClaudeModelCatalog } from './claude-model-catalog'
import { getCodexModelCatalog, invalidateCodexModelCatalog } from './codex-model-catalog'
// Cursor Agent disabled — also excluded from tsconfig.node.json
// import { getCursorModelCatalog, invalidateCursorModelCatalog } from './cursor-model-catalog'

export { getAgentConfig, saveAgentConfig, sanitizeAgentConfigForRenderer } from './agent-config'

export async function getModelCatalog(
  agentId: string,
  forceRefresh = false
): Promise<ModelCatalogResult> {
  switch (agentId) {
    case 'claude-code':
      return getClaudeModelCatalog(forceRefresh)
    case 'codex':
      return getCodexModelCatalog(forceRefresh)
    // case 'cursor':
    //   return getCursorModelCatalog(forceRefresh)
    default:
      return {
        agentId,
        models: [],
        discoveredModels: [],
        defaultModelId: '',
        source: 'fallback',
        discoveredSource: 'fallback'
      }
  }
}

export function invalidateModelCatalog(agentId?: string): void {
  if (!agentId) {
    invalidateClaudeModelCatalog()
    invalidateCodexModelCatalog()
    // invalidateCursorModelCatalog()
    return
  }

  if (agentId === 'claude-code') {
    invalidateClaudeModelCatalog()
  } else if (agentId === 'codex') {
    invalidateCodexModelCatalog()
  }
  // else if (agentId === 'cursor') {
  //   invalidateCursorModelCatalog()
  // }
}
