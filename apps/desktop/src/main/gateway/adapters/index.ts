import { createAnthropicAdapter } from './anthropic'
import { createOpenAiChatAdapter } from './openai-chat'
import type { ProviderAdapter, WireAdapterName } from './base'

const adapters: Record<WireAdapterName, ProviderAdapter> = {
  'openai-chat': createOpenAiChatAdapter(),
  anthropic: createAnthropicAdapter()
}

export function resolveAdapter(name: WireAdapterName): ProviderAdapter {
  return adapters[name]
}

export type { ProviderAdapter }
export { joinUrl } from './base'
