export interface TokenUsageFields {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUSD: number
  totalTokens?: number
  reasoningTokens?: number
}

function readNumber(raw: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function readOptionalNumber(raw: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  }
  return undefined
}

/** Map Cursor CLI `result.usage` or SDK usage payloads into app TokenUsage. */
export function mapRawTokenUsage(
  raw: Record<string, unknown> | undefined
): TokenUsageFields | undefined {
  if (!raw) return undefined

  const inputTokens = readNumber(raw, 'inputTokens', 'input_tokens')
  const outputTokens = readNumber(raw, 'outputTokens', 'output_tokens')
  const cacheReadTokens = readNumber(raw, 'cacheReadTokens', 'cache_read_tokens')
  const cacheCreationTokens = readNumber(
    raw,
    'cacheWriteTokens',
    'cache_write_tokens',
    'cacheCreationTokens',
    'cache_creation_tokens'
  )
  const reasoningTokens = readOptionalNumber(raw, 'reasoningTokens', 'reasoning_tokens')

  const explicitTotal = readNumber(raw, 'totalTokens', 'total_tokens')
  const totalTokens =
    explicitTotal > 0
      ? explicitTotal
      : inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens

  if (
    totalTokens === 0 &&
    inputTokens === 0 &&
    outputTokens === 0 &&
    cacheReadTokens === 0 &&
    cacheCreationTokens === 0
  ) {
    return undefined
  }

  const costRaw = raw.costUSD ?? raw.cost_usd ?? raw.cost ?? raw.totalCost ?? raw.total_cost
  const costUSD = typeof costRaw === 'number' && Number.isFinite(costRaw) ? costRaw : 0

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    costUSD,
    totalTokens,
    ...(reasoningTokens != null ? { reasoningTokens } : {})
  }
}

/** Map @cursor/sdk TokenUsage (cacheWriteTokens) into app shape. */
export function mapSdkTokenUsage(usage: {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  reasoningTokens?: number
}): TokenUsageFields {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheCreationTokens: usage.cacheWriteTokens,
    costUSD: 0,
    totalTokens: usage.totalTokens,
    ...(usage.reasoningTokens != null ? { reasoningTokens: usage.reasoningTokens } : {})
  }
}

export function computeDisplayTotal(usage: TokenUsageFields): number {
  if (usage.totalTokens != null && usage.totalTokens > 0) return usage.totalTokens
  return (
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheReadTokens +
    usage.cacheCreationTokens
  )
}

export function formatTokenUsageSummary(usage: TokenUsageFields): string {
  const total = computeDisplayTotal(usage)
  const parts = [`共 ${total} token`]

  const details: string[] = [`输入 ${usage.inputTokens}`, `输出 ${usage.outputTokens}`]
  if (usage.cacheReadTokens > 0) {
    details.push(`缓存读 ${usage.cacheReadTokens}`)
  }
  if (usage.cacheCreationTokens > 0) {
    details.push(`缓存写 ${usage.cacheCreationTokens}`)
  }
  if (usage.reasoningTokens != null && usage.reasoningTokens > 0) {
    details.push(`推理 ${usage.reasoningTokens}`)
  }
  parts.push(`（${details.join(' · ')}）`)

  if (usage.costUSD > 0) {
    parts.push(`成本 $${usage.costUSD.toFixed(4)}`)
  }

  return parts.join(' ')
}
