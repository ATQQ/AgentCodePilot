export interface ClaudeModelOption {
  id: string
  name: string
  description: string
}

/** Default when no model is explicitly set — Claude Code SDK alias for Sonnet. */
export const DEFAULT_CLAUDE_MODEL_ID = 'sonnet'

export const CLAUDE_CODE_MODELS: ClaudeModelOption[] = [
  {
    id: 'sonnet',
    name: 'Sonnet',
    description: 'Balanced speed and capability (default)'
  },
  {
    id: 'opus',
    name: 'Opus',
    description: 'Most capable, best for complex tasks'
  },
  {
    id: 'haiku',
    name: 'Haiku',
    description: 'Fastest, best for simple tasks'
  }
]

export function getClaudeModelName(modelId: string): string {
  return CLAUDE_CODE_MODELS.find((m) => m.id === modelId)?.name ?? modelId
}
