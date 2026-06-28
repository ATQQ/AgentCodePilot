import type { AgentRunInput } from './types'

export function buildAgentPrompt(input: AgentRunInput, sessionId: string | undefined): string {
  if (sessionId) {
    return input.content
  }

  if (input.conversationHistory && input.conversationHistory.length > 0) {
    const history = [...input.conversationHistory]
    const last = history[history.length - 1]
    if (last?.role === 'user') {
      history[history.length - 1] = { role: 'user', content: input.content }
    } else {
      history.push({ role: 'user', content: input.content })
    }
    return history
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')
  }

  return input.content
}

export function withWorkspaceContext(prompt: string, workspaceFolders?: string[]): string {
  if (!workspaceFolders || workspaceFolders.length <= 1) return prompt
  const folderList = workspaceFolders.map((f) => `- ${f}`).join('\n')
  return `[Workspace Context] This is a multi-directory workspace. The working directories are:\n${folderList}\nYou may need to work across these directories.\n\n${prompt}`
}
