/** Tool context ported from cc-switch transform_codex_chat.rs CodexToolContext */

import { shortSha256Hex } from './common'

const TOOL_SEARCH_PROXY_NAME = 'tool_search'
const CUSTOM_TOOL_INPUT_FIELD = 'input'
const CHAT_TOOL_NAME_MAX_LEN = 64
const CUSTOM_TOOL_INPUT_DESCRIPTION =
  'Raw string input for the original custom tool. Preserve formatting exactly and follow the original tool definition embedded in the description.'
const CUSTOM_TOOL_PRESERVED_METADATA_HEADING = 'Original tool definition:'

export type CodexToolKind = 'function' | 'namespace' | 'custom' | 'tool_search'

export interface CodexToolSpec {
  kind: CodexToolKind
  name: string
  namespace?: string
}

export class CodexToolContext {
  private chatTools: Record<string, unknown>[] = []
  private seenChatNames = new Set<string>()
  private chatNameToSpec = new Map<string, CodexToolSpec>()
  private namespaceNameToChatName = new Map<string, string>()

  chatToolsList(): Record<string, unknown>[] {
    return this.chatTools
  }

  lookupChatName(chatName: string): CodexToolSpec | undefined {
    return this.chatNameToSpec.get(chatName)
  }

  isCustomToolChatName(chatName: string): boolean {
    return this.lookupChatName(chatName)?.kind === 'custom'
  }

  isToolSearchChatName(chatName: string): boolean {
    return this.lookupChatName(chatName)?.kind === 'tool_search'
  }

  chatNameForResponseFunction(name: string, namespace?: string): string {
    if (namespace) {
      const key = `${namespace}\0${name}`
      const mapped = this.namespaceNameToChatName.get(key)
      if (mapped) return mapped
      return flattenNamespaceToolName(namespace, name)
    }
    return name
  }

  private addChatTool(
    chatName: string,
    spec: CodexToolSpec,
    chatTool: Record<string, unknown>
  ): void {
    if (!chatName.trim() || this.seenChatNames.has(chatName)) return
    this.seenChatNames.add(chatName)
    if (spec.namespace) {
      this.namespaceNameToChatName.set(`${spec.namespace}\0${spec.name}`, chatName)
    }
    this.chatNameToSpec.set(chatName, spec)
    this.chatTools.push(chatTool)
  }

  private addFunctionTool(tool: Record<string, unknown>, namespace?: string): void {
    const originalName = responsesToolName(tool)
    if (!originalName) return
    const chatName = namespace ? flattenNamespaceToolName(namespace, originalName) : originalName
    const chatTool = responsesFunctionToolToChatTool(tool, chatName)
    if (!chatTool) return
    this.addChatTool(
      chatName,
      {
        kind: namespace ? 'namespace' : 'function',
        name: originalName,
        namespace
      },
      chatTool
    )
  }

  private addCustomTool(tool: Record<string, unknown>): void {
    const name = responsesToolName(tool)
    if (!name) return
    const chatTool = {
      type: 'function',
      function: {
        name,
        description: responsesCustomToolDescription(tool),
        parameters: {
          type: 'object',
          properties: {
            [CUSTOM_TOOL_INPUT_FIELD]: {
              type: 'string',
              description: CUSTOM_TOOL_INPUT_DESCRIPTION
            }
          },
          required: [CUSTOM_TOOL_INPUT_FIELD]
        }
      }
    }
    this.addChatTool(name, { kind: 'custom', name }, chatTool)
  }

  private addToolSearchTool(): void {
    const chatTool = {
      type: 'function',
      function: {
        name: TOOL_SEARCH_PROXY_NAME,
        description:
          'Search and load Codex tools, plugins, connectors, and MCP namespaces for the current task.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for tools or connectors to load.'
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of tool groups to return.'
            }
          },
          required: ['query']
        }
      }
    }
    this.addChatTool(
      TOOL_SEARCH_PROXY_NAME,
      { kind: 'tool_search', name: TOOL_SEARCH_PROXY_NAME },
      chatTool
    )
  }

  private addNamespaceTool(namespaceTool: Record<string, unknown>): void {
    const namespace = typeof namespaceTool.name === 'string' ? namespaceTool.name : ''
    if (!namespace) return
    const children = Array.isArray(namespaceTool.tools)
      ? namespaceTool.tools
      : Array.isArray(namespaceTool.children)
        ? namespaceTool.children
        : []
    for (const child of children) {
      if (!child || typeof child !== 'object' || Array.isArray(child)) continue
      const c = child as Record<string, unknown>
      if (c.type === 'function') this.addFunctionTool(c, namespace)
    }
  }

  addResponseTool(tool: unknown): void {
    if (typeof tool === 'string') {
      this.addCustomTool({ type: 'custom', name: tool })
      return
    }
    if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return
    const obj = tool as Record<string, unknown>
    switch (obj.type) {
      case 'function':
        this.addFunctionTool(obj)
        break
      case 'custom':
        this.addCustomTool(obj)
        break
      case 'tool_search':
        this.addToolSearchTool()
        break
      case 'namespace':
        this.addNamespaceTool(obj)
        break
      default:
        break
    }
  }
}

export function buildCodexToolContextFromRequest(body: Record<string, unknown>): CodexToolContext {
  const context = new CodexToolContext()
  if (Array.isArray(body.tools)) {
    for (const tool of body.tools) context.addResponseTool(tool)
  }
  if (body.input !== undefined) collectToolSearchOutputTools(body.input, context)
  return context
}

function collectToolSearchOutputTools(value: unknown, context: CodexToolContext): void {
  if (Array.isArray(value)) {
    for (const item of value) collectToolSearchOutputTools(item, context)
    return
  }
  if (!value || typeof value !== 'object') return
  const obj = value as Record<string, unknown>
  if (obj.type === 'tool_search_output' && Array.isArray(obj.tools)) {
    for (const tool of obj.tools) context.addResponseTool(tool)
  }
  for (const child of Object.values(obj)) collectToolSearchOutputTools(child, context)
}

export function flattenNamespaceToolName(namespace: string, name: string): string {
  const fullName = `${namespace}__${name}`
  if (fullName.length <= CHAT_TOOL_NAME_MAX_LEN) return fullName
  const hash = shortSha256Hex(fullName)
  const suffix = `__${hash}`
  const prefixLen = Math.max(0, CHAT_TOOL_NAME_MAX_LEN - suffix.length)
  return `${fullName.slice(0, prefixLen)}${suffix}`
}

function responsesToolName(tool: Record<string, unknown>): string | undefined {
  const fromFunction =
    tool.function && typeof tool.function === 'object' && !Array.isArray(tool.function)
      ? (tool.function as Record<string, unknown>).name
      : undefined
  const name = typeof fromFunction === 'string' ? fromFunction : tool.name
  if (typeof name !== 'string') return undefined
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function responsesFunctionToolToChatTool(
  tool: Record<string, unknown>,
  chatName: string
): Record<string, unknown> | undefined {
  const fn =
    tool.function && typeof tool.function === 'object' && !Array.isArray(tool.function)
      ? ({ ...(tool.function as Record<string, unknown>) } as Record<string, unknown>)
      : ({ ...tool } as Record<string, unknown>)

  fn.name = chatName
  let parameters =
    fn.parameters && typeof fn.parameters === 'object' && !Array.isArray(fn.parameters)
      ? ({ ...(fn.parameters as Record<string, unknown>) } as Record<string, unknown>)
      : tool.parameters && typeof tool.parameters === 'object' && !Array.isArray(tool.parameters)
        ? ({ ...(tool.parameters as Record<string, unknown>) } as Record<string, unknown>)
        : undefined

  if (!parameters) {
    parameters = { type: 'object', properties: {} }
  } else if (parameters.type !== 'object') {
    parameters.type = 'object'
  }
  fn.parameters = parameters

  const chatTool: Record<string, unknown> = {
    type: 'function',
    function: fn
  }
  if (typeof tool.strict === 'boolean') chatTool.strict = tool.strict
  else if (typeof fn.strict === 'boolean') chatTool.strict = fn.strict
  return chatTool
}

function responsesCustomToolDescription(tool: Record<string, unknown>): string {
  let serialized: string
  try {
    serialized = JSON.stringify(tool)
  } catch {
    serialized = '{}'
  }
  return `${CUSTOM_TOOL_PRESERVED_METADATA_HEADING}\n\`\`\`json\n${serialized}\n\`\`\``
}

export function responsesToolChoiceToChat(
  toolChoice: unknown,
  toolContext: CodexToolContext
): unknown {
  if (!toolChoice || typeof toolChoice !== 'object' || Array.isArray(toolChoice)) {
    return toolChoice
  }
  const obj = toolChoice as Record<string, unknown>
  const type = obj.type
  if (type === 'function') {
    const name =
      (typeof obj.name === 'string' && obj.name) ||
      (obj.function &&
      typeof obj.function === 'object' &&
      !Array.isArray(obj.function) &&
      typeof (obj.function as Record<string, unknown>).name === 'string'
        ? ((obj.function as Record<string, unknown>).name as string)
        : '')
    const namespace = typeof obj.namespace === 'string' ? obj.namespace : undefined
    const chatName = toolContext.chatNameForResponseFunction(name, namespace)
    return { type: 'function', function: { name: chatName } }
  }
  if (type === 'custom') {
    const name = typeof obj.name === 'string' ? obj.name : ''
    return { type: 'function', function: { name } }
  }
  if (type === 'tool_search') {
    return { type: 'function', function: { name: TOOL_SEARCH_PROXY_NAME } }
  }
  return toolChoice
}

export function customToolInputFromChatArguments(args: string): string {
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>
    if (typeof parsed.input === 'string') return parsed.input
  } catch {
    // fall through
  }
  return args
}

export function responseToolCallItemFromChatName(
  itemId: string,
  status: string,
  callId: string,
  chatName: string,
  argumentsText: string,
  reasoning: string | undefined,
  toolContext: CodexToolContext
): Record<string, unknown> {
  const spec = toolContext.lookupChatName(chatName)
  if (spec?.kind === 'custom') {
    const item: Record<string, unknown> = {
      id: itemId,
      type: 'custom_tool_call',
      status,
      call_id: callId,
      name: spec.name,
      input: customToolInputFromChatArguments(argumentsText)
    }
    if (reasoning?.trim()) item.reasoning_content = reasoning.trim()
    return item
  }
  if (spec?.kind === 'tool_search') {
    const item: Record<string, unknown> = {
      id: itemId,
      type: 'tool_search_call',
      status,
      call_id: callId,
      execution: 'client',
      arguments: argumentsText
    }
    if (reasoning?.trim()) item.reasoning_content = reasoning.trim()
    return item
  }
  const name = spec?.name ?? chatName
  const namespace = spec?.namespace
  const item: Record<string, unknown> = {
    id: itemId,
    type: 'function_call',
    status,
    call_id: callId,
    name,
    arguments: argumentsText
  }
  if (namespace) item.namespace = namespace
  if (reasoning?.trim()) item.reasoning_content = reasoning.trim()
  return item
}

export function responseToolCallItemIdFromChatName(
  callId: string,
  chatName: string,
  toolContext: CodexToolContext
): string {
  const spec = toolContext.lookupChatName(chatName)
  if (spec?.kind === 'custom') return `ctc_${callId}`
  if (spec?.kind === 'tool_search') return `tsc_${callId}`
  return `fc_${callId}`
}

export { TOOL_SEARCH_PROXY_NAME, CUSTOM_TOOL_INPUT_FIELD }
