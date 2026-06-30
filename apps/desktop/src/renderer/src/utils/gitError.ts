export function formatGitOperationError(
  err: unknown,
  fallback: string
): { summary: string; log: string } {
  if (!(err instanceof Error)) {
    return { summary: fallback, log: fallback }
  }

  let log = err.message.trim()
  log = log.replace(/^GitError:\s*/i, '').replace(/^Error:\s*/i, '').trim()

  const stackIdx = log.indexOf('\n    at ')
  if (stackIdx > 0) {
    log = log.slice(0, stackIdx).trim()
  }

  if (!log) {
    return { summary: fallback, log: fallback }
  }

  const lines = log.split('\n').map((line) => line.trim()).filter(Boolean)
  const summaryLine =
    lines.find(
      (line) =>
        line.startsWith('✖') ||
        (/error|failed|失败|rejected|hook/i.test(line) && !line.startsWith('['))
    ) ??
    lines.find((line) => !line.startsWith('[')) ??
    lines[0]

  return {
    summary: (summaryLine ?? fallback).slice(0, 240),
    log
  }
}
