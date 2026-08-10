/** Time to wait for upstream response headers before aborting (streaming may continue longer). */
export const UPSTREAM_HEADERS_TIMEOUT_MS = 60_000

export class UpstreamHeadersTimeoutError extends Error {
  readonly timeoutMs: number

  constructor(timeoutMs: number = UPSTREAM_HEADERS_TIMEOUT_MS) {
    super(`上游响应超时（${Math.round(timeoutMs / 1000)}s 内未返回响应头）`)
    this.name = 'UpstreamHeadersTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = (error as { name?: string }).name
  return name === 'AbortError' || name === 'TimeoutError'
}

/**
 * Like fetch(), but aborts if response headers are not received within `headersTimeoutMs`.
 * After headers arrive the timeout is cleared so long SSE streams are not cut off.
 * Client `init.signal` still aborts the request/body when the caller cancels.
 */
export async function fetchWithHeadersTimeout(
  url: string,
  init: RequestInit = {},
  headersTimeoutMs: number = UPSTREAM_HEADERS_TIMEOUT_MS
): Promise<Response> {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), headersTimeoutMs)

  const signal =
    init.signal != null ? AbortSignal.any([init.signal, timeout.signal]) : timeout.signal

  try {
    return await fetch(url, { ...init, signal })
  } catch (error) {
    if (timeout.signal.aborted && !init.signal?.aborted && isAbortError(error)) {
      throw new UpstreamHeadersTimeoutError(headersTimeoutMs)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
