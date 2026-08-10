import { randomBytes } from 'crypto'
import { getSetting, setSetting } from '../database/repositories'
import type {
  ChannelProtocolBindings,
  GatewayLoggingSettings,
  GatewaySettings,
  GatewayTakeoverFlags,
  WireAdapter
} from './types'

const SETTINGS_KEY = 'gateway'

const DEFAULT_TAKEOVER: GatewayTakeoverFlags = {
  claudeCli: false,
  claudeDesktop: false,
  codex: false
}

const DEFAULT_LOGGING: GatewayLoggingSettings = {
  enabled: false,
  viewerPort: 3457,
  openBrowser: true
}

const DEFAULT_CHANNEL_PROTOCOLS: ChannelProtocolBindings = {
  claudeCli: 'anthropic',
  claudeDesktop: 'anthropic',
  codex: 'openai-chat'
}

export function generateGatewayToken(): string {
  return `agp-${randomBytes(24).toString('hex')}`
}

export function getDefaultGatewaySettings(): GatewaySettings {
  return {
    enabled: true,
    host: '127.0.0.1',
    port: 3456,
    token: '',
    channelProtocols: { ...DEFAULT_CHANNEL_PROTOCOLS },
    takeover: { ...DEFAULT_TAKEOVER },
    logging: { ...DEFAULT_LOGGING }
  }
}

function parseLogging(raw: Partial<GatewayLoggingSettings> | undefined): GatewayLoggingSettings {
  return {
    enabled: Boolean(raw?.enabled),
    viewerPort:
      typeof raw?.viewerPort === 'number' && Number.isFinite(raw.viewerPort) && raw.viewerPort > 0
        ? Math.floor(raw.viewerPort)
        : DEFAULT_LOGGING.viewerPort,
    openBrowser:
      raw?.openBrowser === undefined ? DEFAULT_LOGGING.openBrowser : Boolean(raw.openBrowser)
  }
}

function isWireAdapter(value: unknown): value is WireAdapter {
  return value === 'openai-chat' || value === 'anthropic' || value === 'openai-responses'
}

function parseChannelProtocols(
  raw: Partial<ChannelProtocolBindings> | undefined
): ChannelProtocolBindings {
  return {
    claudeCli: isWireAdapter(raw?.claudeCli) ? raw!.claudeCli : DEFAULT_CHANNEL_PROTOCOLS.claudeCli,
    claudeDesktop: isWireAdapter(raw?.claudeDesktop)
      ? raw!.claudeDesktop
      : DEFAULT_CHANNEL_PROTOCOLS.claudeDesktop,
    codex: isWireAdapter(raw?.codex) ? raw!.codex : DEFAULT_CHANNEL_PROTOCOLS.codex
  }
}

export function loadGatewaySettings(): GatewaySettings {
  const defaults = getDefaultGatewaySettings()
  const raw = getSetting(SETTINGS_KEY)
  if (!raw) return defaults

  try {
    const parsed = JSON.parse(raw) as Partial<GatewaySettings>
    return {
      enabled: Boolean(parsed.enabled),
      host:
        typeof parsed.host === 'string' && parsed.host.trim() ? parsed.host.trim() : defaults.host,
      port:
        typeof parsed.port === 'number' && Number.isFinite(parsed.port) && parsed.port > 0
          ? Math.floor(parsed.port)
          : defaults.port,
      token: typeof parsed.token === 'string' ? parsed.token : '',
      defaultProviderId:
        typeof parsed.defaultProviderId === 'string' ? parsed.defaultProviderId : undefined,
      channelProtocols: parseChannelProtocols(parsed.channelProtocols),
      takeover: {
        claudeCli: Boolean(parsed.takeover?.claudeCli),
        claudeDesktop: Boolean(parsed.takeover?.claudeDesktop),
        codex: Boolean(parsed.takeover?.codex)
      },
      logging: parseLogging(parsed.logging)
    }
  } catch {
    return defaults
  }
}

export function saveGatewaySettings(settings: GatewaySettings): void {
  setSetting(SETTINGS_KEY, JSON.stringify(settings))
}

export function updateGatewaySettings(patch: Partial<GatewaySettings>): GatewaySettings {
  const current = loadGatewaySettings()
  const next: GatewaySettings = {
    ...current,
    ...patch,
    takeover: patch.takeover ? { ...current.takeover, ...patch.takeover } : current.takeover,
    logging: patch.logging ? { ...current.logging, ...patch.logging } : current.logging,
    channelProtocols: patch.channelProtocols
      ? { ...current.channelProtocols, ...patch.channelProtocols }
      : current.channelProtocols
  }
  if (!next.token) {
    next.token = generateGatewayToken()
  }
  saveGatewaySettings(next)
  return next
}

export function ensureGatewayToken(settings?: GatewaySettings): GatewaySettings {
  const current = settings ?? loadGatewaySettings()
  if (current.token) return current
  return updateGatewaySettings({ token: generateGatewayToken() })
}
