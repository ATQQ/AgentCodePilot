import type { ServerResponse } from 'http'
import type { AdapterEvent } from '../types'

export function writeSseHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  })
}

export function writeJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(JSON.stringify(data))
}

export async function consumeEvents(
  events: AsyncIterable<AdapterEvent>,
  onDelta: (text: string) => void
): Promise<{ usage?: AdapterEvent['usage']; rawUsage?: Record<string, unknown> }> {
  let usage: AdapterEvent['usage']
  let rawUsage: Record<string, unknown> | undefined
  for await (const event of events) {
    if (event.type === 'text_delta' && event.text) onDelta(event.text)
    if (event.type === 'error') throw new Error(event.error || 'Upstream error')
    if (event.type === 'done') {
      usage = event.usage
      rawUsage = event.rawUsage
    }
  }
  return { usage, rawUsage }
}
