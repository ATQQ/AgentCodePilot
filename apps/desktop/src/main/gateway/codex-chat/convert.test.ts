/**
 * Conversion unit checks for Responses↔Chat (run with Node).
 * node --experimental-strip-types --test apps/desktop/src/main/gateway/codex-chat/convert.test.ts
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { responsesToChatCompletions } from './request'
import { chatCompletionToResponse } from './response'
import { ChatToResponsesStream } from './streaming'

describe('responsesToChatCompletions', () => {
  it('drops tool_choice when tools are empty', () => {
    const { chatBody } = responsesToChatCompletions({
      model: 'deepseek-chat',
      input: 'hi',
      tool_choice: 'auto',
      parallel_tool_calls: true
    })
    assert.equal(chatBody.tool_choice, undefined)
    assert.equal(chatBody.parallel_tool_calls, undefined)
  })

  it('converts function tools and injects stream include_usage', () => {
    const { chatBody } = responsesToChatCompletions({
      model: 'deepseek-chat',
      instructions: 'be helpful',
      input: [{ type: 'message', role: 'user', content: 'hello' }],
      stream: true,
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } } }
        }
      ],
      tool_choice: 'auto'
    })
    const messages = chatBody.messages as Array<Record<string, unknown>>
    assert.equal(messages[0].role, 'system')
    assert.equal(messages[0].content, 'be helpful')
    assert.equal(messages[1].role, 'user')
    assert.ok(Array.isArray(chatBody.tools))
    assert.equal((chatBody.tools as unknown[]).length, 1)
    assert.equal(chatBody.tool_choice, 'auto')
    assert.deepEqual(chatBody.stream_options, { include_usage: true })
  })

  it('batches function_call into assistant tool_calls and maps outputs', () => {
    const { chatBody } = responsesToChatCompletions({
      model: 'deepseek-chat',
      input: [
        { type: 'message', role: 'user', content: 'weather?' },
        {
          type: 'function_call',
          call_id: 'call_1',
          name: 'get_weather',
          arguments: '{"city":"SF"}'
        },
        {
          type: 'function_call_output',
          call_id: 'call_1',
          output: '{"temp":18}'
        }
      ],
      tools: [{ type: 'function', name: 'get_weather', parameters: { type: 'object' } }]
    })
    const messages = chatBody.messages as Array<Record<string, unknown>>
    const assistant = messages.find((m) => m.role === 'assistant')
    assert.ok(assistant)
    assert.ok(Array.isArray(assistant!.tool_calls))
    assert.equal((assistant!.tool_calls as unknown[]).length, 1)
    assert.equal(assistant!.reasoning_content, 'tool call')
    const tool = messages.find((m) => m.role === 'tool')
    assert.equal(tool?.tool_call_id, 'call_1')
  })
})

describe('chatCompletionToResponse', () => {
  it('maps text + tool_calls + usage', () => {
    const response = chatCompletionToResponse({
      id: 'chatcmpl-abc',
      model: 'deepseek-chat',
      created: 1,
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'done',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'get_weather', arguments: '{"city":"SF"}' }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    })
    assert.equal(response.id, 'resp_abc')
    assert.equal(response.status, 'completed')
    const output = response.output as Array<Record<string, unknown>>
    assert.ok(output.some((i) => i.type === 'message'))
    assert.ok(output.some((i) => i.type === 'function_call'))
    assert.equal((response.usage as Record<string, number>).input_tokens, 10)
  })

  it('strips leading think block into reasoning', () => {
    const response = chatCompletionToResponse({
      id: 'chatcmpl-1',
      model: 'x',
      created: 1,
      choices: [
        {
          message: {
            role: 'assistant',
            content: '<think>plan</think>\nanswer'
          },
          finish_reason: 'stop'
        }
      ]
    })
    const output = response.output as Array<Record<string, unknown>>
    const reasoning = output.find((i) => i.type === 'reasoning')
    const message = output.find((i) => i.type === 'message')
    assert.ok(reasoning)
    assert.equal(
      ((reasoning!.summary as Array<{ text: string }>)[0] as { text: string }).text,
      'plan'
    )
    assert.equal(
      (
        (message!.content as Array<{ type: string; text: string }>)[0] as {
          text: string
        }
      ).text,
      'answer'
    )
  })
})

describe('ChatToResponsesStream', () => {
  it('emits function_call events from tool_calls deltas', () => {
    const stream = new ChatToResponsesStream()
    const events: string[] = []
    events.push(
      ...stream.handleChatChunk({
        id: 'chatcmpl-xyz',
        model: 'deepseek',
        created: 1,
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: 'get_weather', arguments: '{"city":' }
                }
              ]
            }
          }
        ]
      })
    )
    events.push(
      ...stream.handleChatChunk({
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '"SF"}' } }]
            },
            finish_reason: 'tool_calls'
          }
        ]
      })
    )
    events.push(...stream.finish())
    const joined = events.join('')
    assert.ok(joined.includes('response.created'))
    assert.ok(joined.includes('response.output_item.added'))
    assert.ok(joined.includes('response.function_call_arguments.delta'))
    assert.ok(joined.includes('response.function_call_arguments.done'))
    assert.ok(joined.includes('response.completed'))
  })
})
