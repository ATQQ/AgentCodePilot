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

export function computeDisplayTotal(usage) {
  if (usage.totalTokens != null && usage.totalTokens > 0) return usage.totalTokens
  return (
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheReadTokens +
    usage.cacheCreationTokens
  )
}

export function testUsageParsing() {
  const camel = mapRawTokenUsage({
    inputTokens: 1000,
    outputTokens: 200,
    cacheReadTokens: 5000,
    cacheWriteTokens: 800
  })
  if (!camel || computeDisplayTotal(camel) !== 7000) {
    throw new Error(`camelCase usage parse failed: ${JSON.stringify(camel)}`)
  }

  const snake = mapRawTokenUsage({
    input_tokens: 100,
    output_tokens: 20,
    cache_read_tokens: 300,
    cache_write_tokens: 50
  })
  if (!snake || computeDisplayTotal(snake) !== 470) {
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

  if (mapRawTokenUsage({}) != null) {
    throw new Error('empty usage should return undefined')
  }

  return true
}
