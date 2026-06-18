export const DEFAULT_MAX_AGENT_TURNS = 100
export const MIN_MAX_AGENT_TURNS = 10
export const MAX_MAX_AGENT_TURNS = 200

export function clampMaxAgentTurns(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_AGENT_TURNS
  return Math.min(MAX_MAX_AGENT_TURNS, Math.max(MIN_MAX_AGENT_TURNS, Math.round(value)))
}

export function parseMaxAgentTurnsSetting(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_MAX_AGENT_TURNS
  return clampMaxAgentTurns(Number.parseInt(raw, 10))
}
