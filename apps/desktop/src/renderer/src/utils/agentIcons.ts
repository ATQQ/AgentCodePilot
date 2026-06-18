import claudeIcon from '@renderer/assets/claude-icon.svg'
import codexIcon from '@renderer/assets/codex-icon.svg'
import cursorIcon from '@renderer/assets/external-apps/cursor.svg'
import mockIcon from '@renderer/assets/mock-icon.svg'

const AGENT_ICONS: Record<string, string> = {
  'claude-code': claudeIcon,
  codex: codexIcon,
  cursor: cursorIcon,
  mock: mockIcon
}

export function getAgentIcon(agentId: string): string {
  return AGENT_ICONS[agentId] ?? claudeIcon
}
