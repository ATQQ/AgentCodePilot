export async function loadClaudeAgentSdk(): Promise<
  typeof import('@anthropic-ai/claude-agent-sdk')
> {
  return import('@anthropic-ai/claude-agent-sdk')
}
