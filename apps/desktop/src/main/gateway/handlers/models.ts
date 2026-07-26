import { listProviders } from '../provider-store'
import type { WireAdapter } from '../types'

export function listGatewayModels(): Array<{
  id: string
  object: 'model'
  created: number
  owned_by: string
}> {
  const created = Math.floor(Date.now() / 1000)
  const seen = new Set<string>()
  const models: Array<{ id: string; object: 'model'; created: number; owned_by: string }> = []

  const push = (id: string, ownedBy: string): void => {
    if (!id || seen.has(id)) return
    seen.add(id)
    models.push({ id, object: 'model', created, owned_by: ownedBy })
  }

  for (const provider of listProviders()) {
    const ownedBy = provider.id
    if (provider.config.defaultModel) {
      push(provider.config.defaultModel, ownedBy)
      push(`${provider.id}/${provider.config.defaultModel}`, ownedBy)
      push(provider.id, ownedBy)
    }
    for (const model of provider.config.models ?? []) {
      push(model, ownedBy)
      push(`${provider.id}/${model}`, ownedBy)
    }
    for (const alias of Object.keys(provider.config.modelMap ?? {})) {
      push(alias, ownedBy)
      push(`${provider.id}/${alias}`, ownedBy)
    }
  }

  return models
}

export function listProtocolsForProvider(providerId: string): WireAdapter[] {
  const provider = listProviders().find((p) => p.id === providerId)
  if (!provider) return []
  return (Object.keys(provider.config.protocols) as WireAdapter[]).filter(
    (p) => provider.config.protocols[p]?.baseUrl
  )
}
