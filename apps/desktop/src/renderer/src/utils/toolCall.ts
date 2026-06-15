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

function stableStringify(input: Record<string, unknown>): string {
  const sorted = Object.keys(input)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = input[key]
      return acc
    }, {})
  try {
    return JSON.stringify(sorted)
  } catch {
    return String(input)
  }
}

export function getToolCallFingerprint(toolName: string, input: Record<string, unknown>): string {
  return `${toolName}:${stableStringify(input)}`
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
      if (toolCall.toolName === 'Write' && input.content) {
        lines.push({ label: '内容', value: truncateText(String(input.content), 200) })
      }
      if (toolCall.toolName === 'Edit') {
        if (input.old_string) lines.push({ label: '原内容', value: truncateText(String(input.old_string), 120) })
        if (input.new_string) lines.push({ label: '新内容', value: truncateText(String(input.new_string), 120) })
      }
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
  const label = getToolLabel(toolCall.toolName)
  const lines = getToolDetailLines(toolCall)
  if (lines.length === 0) return `${toolCall.toolName} · ${label}`

  const primary = lines.find((l) => l.label === '命令' || l.label === '路径' || l.label === '指令' || l.label === '任务' || l.label === 'URL') ?? lines[0]
  let text = primary.value
  if (primary.label === '命令') text = `$ ${text}`
  if (primary.label === '路径') text = text.split('/').pop() || text
  const detail = text.length <= maxLen ? text : text.slice(0, maxLen) + '…'
  return `${toolCall.toolName} ${label} · ${detail}`
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '…'
}

export function getToolCallHeader(toolCall: ToolCall): string {
  return getToolDetailPreview(toolCall, 40)
}
