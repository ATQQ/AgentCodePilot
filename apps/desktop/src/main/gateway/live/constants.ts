export const PROXY_MANAGED = 'PROXY_MANAGED'

export const CODEX_PROXY_PROVIDER_ID = 'agent-desktop'

export const CLAUDE_DESKTOP_PROFILE_ID = '00000000-0000-4000-8000-000000345600'

export const CLAUDE_AUTH_ENV_KEYS = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY'
] as const

export function buildProxyBaseUrl(host: string, port: number): string {
  return `http://${host}:${port}`
}

export function buildProxyV1Url(host: string, port: number): string {
  return `${buildProxyBaseUrl(host, port)}/v1`
}

export function buildClaudeDesktopGatewayUrl(host: string, port: number): string {
  return `${buildProxyBaseUrl(host, port)}/claude-desktop`
}
