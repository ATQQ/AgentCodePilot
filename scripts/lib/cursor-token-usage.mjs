/** Mirrors apps/desktop/src/shared/token-usage.ts for verify script use. */

function readNumber(raw, ...keys) {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function readOptionalNumber(raw, ...keys) {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  }
  return undefined
}

export function mapRawTokenUsage(raw) {
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
  // Inclusive default: cache is a subset of input for OpenAI-compatible APIs.
  const totalTokens = explicitTotal > 0 ? explicitTotal : inputTokens + outputTokens

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

export function computeDisplayTotal(usage) {
  if (usage.totalTokens != null && usage.totalTokens > 0) return usage.totalTokens
  return usage.inputTokens + usage.outputTokens
}

export function formatTokenUsageSummary(usage) {
  const total = computeDisplayTotal(usage)
  const parts = [`共 ${total} token`]

  const details = [`输入 ${usage.inputTokens}`, `输出 ${usage.outputTokens}`]
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

export function testUsageParsing() {
  // OpenAI-compatible: cache is subset — total = input + output
  const camel = mapRawTokenUsage({
    inputTokens: 1000,
    outputTokens: 200,
    cacheReadTokens: 5000,
    cacheWriteTokens: 800
  })
  if (!camel || computeDisplayTotal(camel) !== 1200) {
    throw new Error(`camelCase usage parse failed: ${JSON.stringify(camel)}`)
  }

  const snake = mapRawTokenUsage({
    input_tokens: 100,
    output_tokens: 20,
    cache_read_tokens: 300,
    cache_write_tokens: 50
  })
  if (!snake || computeDisplayTotal(snake) !== 120) {
    throw new Error(`snake_case usage parse failed: ${JSON.stringify(snake)}`)
  }

  const explicit = mapRawTokenUsage({
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 99
  })
  if (!explicit || explicit.totalTokens !== 99) {
    throw new Error(`explicit totalTokens parse failed: ${JSON.stringify(explicit)}`)
  }

  // Anthropic/Claude: explicit additive total including cache
  const claude = {
    inputTokens: 100,
    outputTokens: 42,
    cacheReadTokens: 200,
    cacheCreationTokens: 50,
    costUSD: 0.01,
    totalTokens: 100 + 42 + 200 + 50
  }
  if (computeDisplayTotal(claude) !== 392) {
    throw new Error(`claude additive total failed: ${computeDisplayTotal(claude)}`)
  }
  const claudeSummary = formatTokenUsageSummary(claude)
  if (!claudeSummary.startsWith('共 392 token')) {
    throw new Error(`claude summary failed: ${claudeSummary}`)
  }

  // Codex inclusive: cache detail must not inflate total
  const codex = {
    inputTokens: 100,
    outputTokens: 20,
    cacheReadTokens: 80,
    cacheCreationTokens: 0,
    costUSD: 0,
    totalTokens: 120
  }
  if (computeDisplayTotal(codex) !== 120) {
    throw new Error(`codex inclusive total failed: ${computeDisplayTotal(codex)}`)
  }
  const codexSummary = formatTokenUsageSummary(codex)
  if (!codexSummary.startsWith('共 120 token') || !codexSummary.includes('缓存读 80')) {
    throw new Error(`codex summary failed: ${codexSummary}`)
  }

  if (mapRawTokenUsage({}) != null) {
    throw new Error('empty usage should return undefined')
  }

  return true
}
