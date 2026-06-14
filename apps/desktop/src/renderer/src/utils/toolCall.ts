import type { ToolCall } from '@renderer/types'

export const TOOL_LABELS: Record<string, string> = {
  Read: '读取文件',
  Write: '写入文件',
  Edit: '编辑文件',
  Bash: '执行命令',
  Glob: '搜索文件',
  Grep: '搜索内容',
  WebFetch: '获取网页',
  WebSearch: '搜索网络',
  Agent: '子代理',
  Task: '子任务'
}

export interface ToolDetailLine {
  label: string
  value: string
}

export function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] || toolName
}

export function getToolDetailLines(toolCall: ToolCall): ToolDetailLine[] {
  const input = toolCall.input
  const lines: ToolDetailLine[] = []

  switch (toolCall.toolName) {
    case 'Agent':
    case 'Task': {
      if (input.description) lines.push({ label: '任务', value: String(input.description) })
      if (input.prompt) lines.push({ label: '指令', value: String(input.prompt) })
      if (input.subagent_type) lines.push({ label: '代理类型', value: String(input.subagent_type) })
      break
    }
    case 'Bash': {
      if (input.command) lines.push({ label: '命令', value: String(input.command) })
      if (input.description) lines.push({ label: '说明', value: String(input.description) })
      break
    }
    case 'Read':
    case 'Write':
    case 'Edit':
      if (input.file_path) lines.push({ label: '路径', value: String(input.file_path) })
      break
    case 'Glob':
      if (input.pattern) lines.push({ label: '模式', value: String(input.pattern) })
      if (input.path) lines.push({ label: '目录', value: String(input.path) })
      break
    case 'Grep':
      if (input.pattern) lines.push({ label: '模式', value: String(input.pattern) })
      if (input.query) lines.push({ label: '查询', value: String(input.query) })
      if (input.path) lines.push({ label: '路径', value: String(input.path) })
      break
    case 'WebFetch':
      if (input.url) lines.push({ label: 'URL', value: String(input.url) })
      break
    case 'WebSearch':
      if (input.query) lines.push({ label: '查询', value: String(input.query) })
      break
    default: {
      for (const [key, val] of Object.entries(input)) {
        if (val === undefined || val === null || val === '') continue
        lines.push({
          label: key,
          value: typeof val === 'string' ? val : JSON.stringify(val)
        })
      }
    }
  }

  if (lines.length === 0 && toolCall.summary) {
    lines.push({ label: '摘要', value: toolCall.summary })
  }

  return lines
}

export function getToolDetail(toolCall: ToolCall): string {
  const lines = getToolDetailLines(toolCall)
  if (lines.length === 0) return ''
  return lines.map((l) => (lines.length === 1 && l.label === '摘要' ? l.value : `${l.value}`)).join('\n')
}

export function getToolDetailPreview(toolCall: ToolCall, maxLen = 60): string {
  const lines = getToolDetailLines(toolCall)
  if (lines.length === 0) return getToolLabel(toolCall.toolName)

  const primary = lines.find((l) => l.label === '命令' || l.label === '路径' || l.label === '指令' || l.label === '任务') ?? lines[0]
  const text = primary.label === '命令' ? `$ ${primary.value}` : primary.value
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '…'
}
