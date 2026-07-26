import { getProviderEndpoint, listProviders, providerSupportsProtocol } from './provider-store'
import { loadGatewaySettings } from './settings-store'
import type { GatewayChannel, GatewayProviderRecord, RouteResult, WireAdapter } from './types'

const CHANNEL_DEFAULT_PROTOCOL: Record<GatewayChannel, WireAdapter> = {
  claudeCli: 'anthropic',
  claudeDesktop: 'anthropic',
  codex: 'openai-chat'
}

function mapModel(provider: GatewayProviderRecord, modelId: string): string {
  return provider.config.modelMap?.[modelId] || modelId
}

function stripNamespace(model: string): { providerId?: string; modelId: string } {
  const idx = model.indexOf('/')
  if (idx <= 0) return { modelId: model }
  return { providerId: model.slice(0, idx), modelId: model.slice(idx + 1) }
}

function matchPrefix(model: string, prefix: string): boolean {
  return model === prefix || model.startsWith(`${prefix}-`) || model.startsWith(`${prefix}/`)
}

function providerModels(provider: GatewayProviderRecord): string[] {
  return provider.config.models ?? []
}

function resolveProtocolForChannel(channel?: GatewayChannel): WireAdapter | undefined {
  if (!channel) return undefined
  const settings = loadGatewaySettings()
  const preferred = settings.channelProtocols[channel] || CHANNEL_DEFAULT_PROTOCOL[channel]
  const providers = listProviders()
  const preferredProvider = settings.defaultProviderId
    ? providers.find((p) => p.id === settings.defaultProviderId)
    : providers[0]
  if (preferredProvider && providerSupportsProtocol(preferredProvider, preferred)) {
    return preferred
  }
  if (preferredProvider) {
    const available = (Object.keys(preferredProvider.config.protocols) as WireAdapter[]).filter(
      (p) => providerSupportsProtocol(preferredProvider, p)
    )
    if (available.length) return available[0]
  }
  return preferred
}

function pickProviderForProtocol(
  providers: GatewayProviderRecord[],
  protocol: WireAdapter,
  preferredId?: string
): GatewayProviderRecord | undefined {
  if (preferredId) {
    const preferred = providers.find((p) => p.id === preferredId)
    if (preferred && providerSupportsProtocol(preferred, protocol)) return preferred
  }
  const settings = loadGatewaySettings()
  if (settings.defaultProviderId) {
    const def = providers.find((p) => p.id === settings.defaultProviderId)
    if (def && providerSupportsProtocol(def, protocol)) return def
  }
  return providers.find((p) => providerSupportsProtocol(p, protocol))
}

function resultFor(
  provider: GatewayProviderRecord,
  protocol: WireAdapter,
  modelId: string
): RouteResult {
  const endpoint = getProviderEndpoint(provider, protocol)
  if (!endpoint?.baseUrl) {
    throw new Error(`Provider "${provider.id}" has no ${protocol} baseUrl`)
  }
  return {
    provider,
    protocol,
    endpoint,
    upstreamModel: mapModel(provider, modelId)
  }
}

/**
 * Resolve inbound model id to a configured provider + protocol endpoint.
 * When `channel` is set, prefer that channel's protocol binding.
 */
export function routeModel(model: string, channel?: GatewayChannel): RouteResult {
  const providers = listProviders()
  if (providers.length === 0) {
    throw new Error('No gateway providers configured. Add a provider in Settings → API Gateway.')
  }

  const trimmed = model.trim()
  if (!trimmed) {
    throw new Error('model is required')
  }

  const { providerId, modelId } = stripNamespace(trimmed)
  const channelProtocol = resolveProtocolForChannel(channel)

  if (providerId) {
    const provider = providers.find((p) => p.id === providerId)
    if (!provider) {
      throw new Error(`Unknown provider "${providerId}" for model "${trimmed}"`)
    }
    const protocol =
      (channelProtocol && providerSupportsProtocol(provider, channelProtocol)
        ? channelProtocol
        : undefined) ||
      (providerSupportsProtocol(provider, provider.config.adapter)
        ? provider.config.adapter
        : undefined) ||
      (Object.keys(provider.config.protocols)[0] as WireAdapter | undefined)
    if (!protocol) {
      throw new Error(`Provider "${providerId}" has no configured protocols`)
    }
    return resultFor(provider, protocol, modelId)
  }

  // Channel protocol binding: pick a provider that supports it
  if (channelProtocol) {
    const bound = pickProviderForProtocol(providers, channelProtocol)
    if (bound) {
      // Prefer exact model match; still allow unbound ids (upstream may remap)
      if (
        bound.config.modelMap?.[modelId] ||
        providerModels(bound).includes(modelId) ||
        bound.config.defaultModel === modelId ||
        !providerModels(bound).length
      ) {
        return resultFor(bound, channelProtocol, modelId)
      }
      return resultFor(bound, channelProtocol, modelId)
    }
  }

  for (const provider of providers) {
    if (
      provider.config.modelMap?.[modelId] ||
      providerModels(provider).includes(modelId) ||
      provider.config.defaultModel === modelId
    ) {
      const protocol =
        (channelProtocol && providerSupportsProtocol(provider, channelProtocol)
          ? channelProtocol
          : undefined) ||
        (providerSupportsProtocol(provider, provider.config.adapter)
          ? provider.config.adapter
          : undefined) ||
        (Object.keys(provider.config.protocols)[0] as WireAdapter | undefined)
      if (!protocol) continue
      return resultFor(provider, protocol, modelId)
    }
  }

  if (matchPrefix(modelId, 'claude') || matchPrefix(modelId, 'anthropic')) {
    const anthropic =
      pickProviderForProtocol(providers, 'anthropic') || providers.find((p) => p.id === 'anthropic')
    if (anthropic && providerSupportsProtocol(anthropic, 'anthropic')) {
      return resultFor(anthropic, 'anthropic', modelId)
    }
  }

  if (
    matchPrefix(modelId, 'gpt') ||
    matchPrefix(modelId, 'o1') ||
    matchPrefix(modelId, 'o3') ||
    matchPrefix(modelId, 'o4')
  ) {
    const openai =
      pickProviderForProtocol(providers, 'openai-chat') || providers.find((p) => p.id === 'openai')
    if (openai && providerSupportsProtocol(openai, 'openai-chat')) {
      return resultFor(openai, 'openai-chat', modelId)
    }
  }

  const settings = loadGatewaySettings()
  const fallbackProtocol = channelProtocol || 'openai-chat'
  const def = pickProviderForProtocol(providers, fallbackProtocol, settings.defaultProviderId)
  if (def) {
    return resultFor(def, fallbackProtocol, modelId)
  }

  // Last resort: any provider with any protocol
  for (const provider of providers) {
    for (const protocol of Object.keys(provider.config.protocols) as WireAdapter[]) {
      if (providerSupportsProtocol(provider, protocol)) {
        return resultFor(provider, protocol, modelId)
      }
    }
  }

  throw new Error('No gateway provider with a usable protocol endpoint configured')
}

/** Kept for backward compatibility with older imports. */
export function resolveAgent(model: string): string {
  try {
    return routeModel(model).provider.id
  } catch {
    return 'unknown'
  }
}
