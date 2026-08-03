import type { ProtocolEndpointConfig } from './types'

/** Merge endpoint header overrides on top of gateway-built headers. */
export function applyHeaderOverrides(
  headers: Record<string, string>,
  overrides?: Record<string, string>
): Record<string, string> {
  if (!overrides) return headers
  const next = { ...headers }
  for (const [key, value] of Object.entries(overrides)) {
    const name = key.trim()
    if (!name || typeof value !== 'string') continue
    next[name] = value
  }
  return next
}

/**
 * Fill missing body keys from defaults.
 * Existing keys (including null) win — only `undefined` / absent keys are filled.
 */
export function applyBodyDefaults(
  body: Record<string, unknown>,
  defaults?: Record<string, unknown>
): Record<string, unknown> {
  if (!defaults) return body
  const next = { ...body }
  for (const [key, value] of Object.entries(defaults)) {
    if (next[key] === undefined) next[key] = value
  }
  return next
}

/** Apply both header overrides and bodyDefaults from an endpoint. */
export function applyEndpointOverrides(
  request: { headers: Record<string, string>; body: Record<string, unknown> },
  endpoint: ProtocolEndpointConfig
): { headers: Record<string, string>; body: Record<string, unknown> } {
  return {
    headers: applyHeaderOverrides(request.headers, endpoint.headers),
    body: applyBodyDefaults(request.body, endpoint.bodyDefaults)
  }
}
