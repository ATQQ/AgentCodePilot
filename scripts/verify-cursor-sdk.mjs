#!/usr/bin/env node
/**
 * Standalone Cursor SDK / CLI verification script.
 *
 * Usage:
 *   pnpm verify:cursor-sdk
 *   pnpm verify:cursor-sdk -- --cwd /path/to/repo
 *   pnpm verify:cursor-sdk -- --mode sdk
 *   pnpm verify:cursor-sdk -- --mode cli
 *   pnpm verify:cursor-sdk -- --mode both
 *   CURSOR_API_KEY=... pnpm verify:cursor-sdk
 *
 * Exit codes:
 *   0 - success
 *   1 - startup/auth/config failure (CursorAgentError or missing deps)
 *   2 - run started but failed (result.status === "error")
 */

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  computeDisplayTotal,
  mapRawTokenUsage,
  testUsageParsing
} from './lib/cursor-token-usage.mjs'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

function parseArgs(argv) {
  const options = {
    cwd: process.cwd(),
    model: 'composer-2.5',
    prompt: '列出当前目录有哪些文件',
    mode: 'both',
    timeoutMs: 120_000
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--cwd' && argv[i + 1]) {
      options.cwd = resolve(argv[++i])
    } else if (arg === '--model' && argv[i + 1]) {
      options.model = argv[++i]
    } else if (arg === '--prompt' && argv[i + 1]) {
      options.prompt = argv[++i]
    } else if (arg === '--mode' && argv[i + 1]) {
      options.mode = argv[++i]
    } else if (arg === '--timeout' && argv[i + 1]) {
      options.timeoutMs = Number(argv[++i])
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/verify-cursor-sdk.mjs [options]

Options:
  --cwd <path>       Workspace directory (default: process.cwd())
  --model <id>       Model id (default: composer-2.5)
  --prompt <text>    Prompt to send
  --mode sdk|cli|both  Which runtime to test (default: both)
  --timeout <ms>     Per-run timeout (default: 120000)
  -h, --help         Show help

Environment:
  CURSOR_API_KEY     Optional explicit API key for SDK / CLI --api-key
`)
      process.exit(0)
    }
  }

  return options
}

function section(title) {
  console.log(`\n=== ${title} ===`)
}

function hasLocalCursorCliLogin() {
  const configPath = join(homedir(), '.cursor', 'cli-config.json')
  if (!existsSync(configPath)) return false
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'))
    return Boolean(parsed?.authInfo?.authId || parsed?.authInfo?.email || parsed?.authInfo?.userId)
  } catch {
    return false
  }
}

function resolveAgentExecutablePath() {
  if (process.platform === 'win32') {
    const pathVar = process.env.Path || process.env.PATH || ''
    for (const dir of pathVar.split(';')) {
      const candidate = join(dir.trim(), 'agent.exe')
      if (candidate && existsSync(candidate)) return candidate
    }
    return undefined
  }

  const shell = process.env.SHELL || '/bin/zsh'
  if (!existsSync(shell)) return undefined

  try {
    const resolved = execFileSync(shell, ['-ilc', 'command -v agent'], {
      encoding: 'utf8',
      timeout: 10_000,
      env: process.env
    }).trim()
    if (resolved && existsSync(resolved)) return resolved
  } catch {
    return undefined
  }

  return undefined
}

function workerLogHint(cwd) {
  const slug = cwd.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  return join(homedir(), '.cursor', 'projects', slug, 'worker.log')
}

function extractAssistantText(message) {
  if (!message || typeof message !== 'object') return ''
  const content = message.content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

function appendAssistantDelta(accumulated, text) {
  if (!text) return accumulated
  if (accumulated && text.startsWith(accumulated)) {
    return accumulated + text.slice(accumulated.length)
  }
  return accumulated + text
}

function summarizeSdkEvent(event) {
  if (event.type === 'assistant') {
    const text = (event.message?.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
    return { type: event.type, run_id: event.run_id, textPreview: text.slice(0, 200) }
  }
  if (event.type === 'status') {
    return {
      type: event.type,
      run_id: event.run_id,
      status: event.status,
      message: event.message
    }
  }
  if (event.type === 'tool_call') {
    return {
      type: event.type,
      run_id: event.run_id,
      name: event.name,
      status: event.status
    }
  }
  return event
}

async function loadCursorSdk() {
  try {
    return await import('@cursor/sdk')
  } catch (error) {
    console.error('Failed to import @cursor/sdk. Run from repo root after pnpm install.')
    throw error
  }
}

async function testSdk(options) {
  section('Cursor SDK')
  const apiKey = process.env.CURSOR_API_KEY?.trim()
  const localCli = hasLocalCursorCliLogin()

  console.log('node:', process.version)
  console.log('cwd:', options.cwd)
  console.log('model:', options.model)
  console.log('auth:', apiKey ? 'CURSOR_API_KEY' : localCli ? 'local CLI login' : 'none')
  console.log('worker.log hint:', workerLogHint(options.cwd))

  const { Agent, CursorAgentError } = await loadCursorSdk()

  let agent
  try {
    const createOptions = {
      model: { id: options.model },
      local: { cwd: options.cwd, enableAgentRetries: true }
    }
    if (apiKey) createOptions.apiKey = apiKey

    agent = await Agent.create(createOptions)
    console.log('agentId:', agent.agentId)
  } catch (error) {
    if (error instanceof CursorAgentError) {
      console.error('startup failed:', error.message, `(retryable=${error.isRetryable})`)
      return 1
    }
    throw error
  }

  let run
  try {
    run = await agent.send(options.prompt)
    console.log('runId:', run.id)
  } catch (error) {
    await agent[Symbol.asyncDispose]?.()
    if (error instanceof CursorAgentError) {
      console.error('send failed:', error.message, `(retryable=${error.isRetryable})`)
      return 1
    }
    throw error
  }

  try {
    for await (const event of run.stream()) {
      console.log(JSON.stringify(summarizeSdkEvent(event)))
      if (event.type === 'usage') {
        const usage = mapRawTokenUsage({
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          cacheReadTokens: event.usage.cacheReadTokens,
          cacheWriteTokens: event.usage.cacheWriteTokens,
          totalTokens: event.usage.totalTokens,
          reasoningTokens: event.usage.reasoningTokens
        })
        console.log('stream usage:', JSON.stringify(usage))
      }
    }

    const result = await run.wait()
    console.log('result:', JSON.stringify(result))

    const resultUsage =
      result.usage != null
        ? mapRawTokenUsage({
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            cacheReadTokens: result.usage.cacheReadTokens,
            cacheWriteTokens: result.usage.cacheWriteTokens,
            totalTokens: result.usage.totalTokens,
            reasoningTokens: result.usage.reasoningTokens
          })
        : run.usage != null
          ? mapRawTokenUsage({
              inputTokens: run.usage.inputTokens,
              outputTokens: run.usage.outputTokens,
              cacheReadTokens: run.usage.cacheReadTokens,
              cacheWriteTokens: run.usage.cacheWriteTokens,
              totalTokens: run.usage.totalTokens,
              reasoningTokens: run.usage.reasoningTokens
            })
          : undefined

    if (resultUsage) {
      console.log('result usage:', JSON.stringify(resultUsage))
      console.log('result usage total:', computeDisplayTotal(resultUsage))
    } else if (result.status !== 'error') {
      console.warn('SDK run finished without usage on result or run handle')
    }

    if (result.status === 'error') {
      console.error('run failed:', result.id, result.result ?? '(no result text)')
      if (run.supports?.('conversation')) {
        const conversation = await run.conversation()
        console.error('conversation turns:', conversation.length)
      }
      return 2
    }

    console.log('SDK run finished:', result.status)
    return 0
  } finally {
    await agent[Symbol.asyncDispose]?.()
  }
}

async function testCli(options) {
  section('Cursor CLI (agent)')
  const agentPath = resolveAgentExecutablePath()
  if (!agentPath) {
    console.error('agent CLI not found in PATH')
    return 1
  }

  const apiKey = process.env.CURSOR_API_KEY?.trim()
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--stream-partial-output',
    '--trust',
    '--workspace',
    options.cwd,
    '--model',
    options.model
  ]
  if (apiKey) args.push('--api-key', apiKey)
  args.push(options.prompt)

  console.log('agent:', agentPath)
  console.log('cwd:', options.cwd)
  console.log('model:', options.model)

  return new Promise((resolvePromise) => {
    const child = spawn(agentPath, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let assistantText = ''
    let resultText = ''
    let parsedUsage = null
    let exitCode = 0
    const timer = setTimeout(() => {
      console.error(`CLI timeout after ${options.timeoutMs}ms`)
      child.kill('SIGTERM')
      resolvePromise(2)
    }, options.timeoutMs)

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim()
      if (text) console.error('[stderr]', text)
    })

    const rl = createInterface({ input: child.stdout })
    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        const event = JSON.parse(trimmed)
        if (event.type === 'assistant') {
          assistantText = appendAssistantDelta(assistantText, extractAssistantText(event.message))
        }
        if (event.type === 'connection' || event.type === 'retry' || event.type === 'status') {
          console.log(JSON.stringify(event))
        }
        if (event.type === 'result') {
          console.log('result:', JSON.stringify(event))
          parsedUsage = mapRawTokenUsage(event.usage)
          if (parsedUsage) {
            console.log('usage:', JSON.stringify(parsedUsage))
            console.log('usage total:', computeDisplayTotal(parsedUsage))
          } else if (event.usage) {
            console.warn('result.usage present but parsed as empty:', JSON.stringify(event.usage))
            exitCode = 2
          } else {
            console.warn('result event missing usage field (upgrade Cursor CLI to 2026-02+ build)')
          }
          resultText = typeof event.result === 'string' ? event.result : ''
          if (event.is_error === true || event.subtype === 'error') {
            exitCode = 2
          }
        }
      } catch {
        console.log(trimmed)
      }
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      rl.close()
      if (assistantText) {
        console.log('assistant preview:', assistantText.slice(0, 400))
      }
      if (resultText && assistantText.trim() !== resultText.trim()) {
        console.warn(
          'assistant stream mismatch vs result:',
          `streamLen=${assistantText.length}, resultLen=${resultText.length}`
        )
      }
      if (exitCode !== 0) {
        resolvePromise(exitCode)
        return
      }
      resolvePromise(code === 0 ? 0 : 2)
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      console.error('CLI spawn failed:', error.message)
      resolvePromise(1)
    })
  })
}

async function main() {
  process.chdir(repoRoot)

  section('Usage parsing')
  try {
    testUsageParsing()
    console.log('usage parsing self-test: ok')
  } catch (error) {
    console.error('usage parsing self-test failed:', error.message)
    process.exit(1)
  }

  const options = parseArgs(process.argv.slice(2))
  if (!existsSync(options.cwd)) {
    console.error(`cwd does not exist: ${options.cwd}`)
    process.exit(1)
  }

  section('Environment')
  console.log('repoRoot:', repoRoot)
  console.log('CURSOR_API_KEY:', process.env.CURSOR_API_KEY ? '(set)' : '(not set)')
  console.log('local CLI login:', hasLocalCursorCliLogin())
  console.log('agent CLI:', resolveAgentExecutablePath() ?? '(not found)')

  const results = []

  if (options.mode === 'sdk' || options.mode === 'both') {
    results.push(await testSdk(options))
  }
  if (options.mode === 'cli' || options.mode === 'both') {
    results.push(await testCli(options))
  }

  section('Summary')
  if (options.mode === 'both') {
    console.log('SDK exit code:', results[0])
    console.log('CLI exit code:', results[1])
    if (results[0] !== 0 && results[1] === 0) {
      console.log(
        'Diagnosis: CLI works but SDK fails — likely SDK local bridge/network retry issue, not app integration.'
      )
    }
  } else {
    console.log('exit code:', results[0])
  }

  const worst = results.reduce((max, code) => Math.max(max, code), 0)
  process.exit(worst)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
