/** Responses SSE envelope helpers ported from cc-switch codex_responses_sse.rs */

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function responseCreated(response: unknown): string {
  return sseEvent('response.created', { type: 'response.created', response })
}

export function responseInProgress(response: unknown): string {
  return sseEvent('response.in_progress', { type: 'response.in_progress', response })
}

export function responseCompleted(response: unknown): string {
  return sseEvent('response.completed', { type: 'response.completed', response })
}

export function responseFailed(response: unknown): string {
  return sseEvent('response.failed', { type: 'response.failed', response })
}

export function outputItemAdded(outputIndex: number, item: unknown): string {
  return sseEvent('response.output_item.added', {
    type: 'response.output_item.added',
    output_index: outputIndex,
    item
  })
}

export function outputItemDone(outputIndex: number, item: unknown): string {
  return sseEvent('response.output_item.done', {
    type: 'response.output_item.done',
    output_index: outputIndex,
    item
  })
}

export function messageItemAdded(outputIndex: number, itemId: string): string {
  return outputItemAdded(outputIndex, {
    id: itemId,
    type: 'message',
    status: 'in_progress',
    role: 'assistant',
    content: []
  })
}

export function messageContentPartAdded(outputIndex: number, itemId: string): string {
  return sseEvent('response.content_part.added', {
    type: 'response.content_part.added',
    item_id: itemId,
    output_index: outputIndex,
    content_index: 0,
    part: { type: 'output_text', text: '', annotations: [] }
  })
}

export function outputTextDelta(outputIndex: number, itemId: string, delta: string): string {
  return sseEvent('response.output_text.delta', {
    type: 'response.output_text.delta',
    item_id: itemId,
    output_index: outputIndex,
    content_index: 0,
    delta
  })
}

export function messageItem(itemId: string, text: string): Record<string, unknown> {
  return {
    id: itemId,
    type: 'message',
    status: 'completed',
    role: 'assistant',
    content: [{ type: 'output_text', text, annotations: [] }]
  }
}

export function messageClose(
  outputIndex: number,
  itemId: string,
  text: string
): { events: string[]; item: Record<string, unknown> } {
  const item = messageItem(itemId, text)
  return {
    events: [
      sseEvent('response.output_text.done', {
        type: 'response.output_text.done',
        item_id: itemId,
        output_index: outputIndex,
        content_index: 0,
        text
      }),
      sseEvent('response.content_part.done', {
        type: 'response.content_part.done',
        item_id: itemId,
        output_index: outputIndex,
        content_index: 0,
        part: { type: 'output_text', text, annotations: [] }
      }),
      outputItemDone(outputIndex, item)
    ],
    item
  }
}

export function reasoningItemAdded(outputIndex: number, itemId: string): string {
  return outputItemAdded(outputIndex, {
    id: itemId,
    type: 'reasoning',
    status: 'in_progress',
    summary: []
  })
}

export function reasoningSummaryPartAdded(outputIndex: number, itemId: string): string {
  return sseEvent('response.reasoning_summary_part.added', {
    type: 'response.reasoning_summary_part.added',
    item_id: itemId,
    output_index: outputIndex,
    summary_index: 0,
    part: { type: 'summary_text', text: '' }
  })
}

export function reasoningSummaryTextDelta(
  outputIndex: number,
  itemId: string,
  delta: string
): string {
  return sseEvent('response.reasoning_summary_text.delta', {
    type: 'response.reasoning_summary_text.delta',
    item_id: itemId,
    output_index: outputIndex,
    summary_index: 0,
    delta
  })
}

export function reasoningItem(itemId: string, text: string): Record<string, unknown> {
  return {
    id: itemId,
    type: 'reasoning',
    summary: [{ type: 'summary_text', text }]
  }
}

export function reasoningClose(
  outputIndex: number,
  itemId: string,
  text: string
): { events: string[]; item: Record<string, unknown> } {
  const item = reasoningItem(itemId, text)
  return {
    events: [
      sseEvent('response.reasoning_summary_text.done', {
        type: 'response.reasoning_summary_text.done',
        item_id: itemId,
        output_index: outputIndex,
        summary_index: 0,
        text
      }),
      sseEvent('response.reasoning_summary_part.done', {
        type: 'response.reasoning_summary_part.done',
        item_id: itemId,
        output_index: outputIndex,
        summary_index: 0,
        part: { type: 'summary_text', text }
      }),
      outputItemDone(outputIndex, item)
    ],
    item
  }
}

export function functionCallArgumentsDelta(
  outputIndex: number,
  itemId: string,
  delta: string
): string {
  return sseEvent('response.function_call_arguments.delta', {
    type: 'response.function_call_arguments.delta',
    item_id: itemId,
    output_index: outputIndex,
    delta
  })
}

export function functionCallArgumentsDone(
  outputIndex: number,
  itemId: string,
  argumentsText: string
): string {
  return sseEvent('response.function_call_arguments.done', {
    type: 'response.function_call_arguments.done',
    item_id: itemId,
    output_index: outputIndex,
    arguments: argumentsText
  })
}

export function customToolCallInputDelta(
  outputIndex: number,
  itemId: string,
  delta: string
): string {
  return sseEvent('response.custom_tool_call_input.delta', {
    type: 'response.custom_tool_call_input.delta',
    item_id: itemId,
    output_index: outputIndex,
    delta
  })
}

export function customToolCallInputDone(
  outputIndex: number,
  itemId: string,
  input: string
): string {
  return sseEvent('response.custom_tool_call_input.done', {
    type: 'response.custom_tool_call_input.done',
    item_id: itemId,
    output_index: outputIndex,
    input
  })
}
