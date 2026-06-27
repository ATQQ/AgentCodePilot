export async function loadCodexSdk(): Promise<typeof import('@openai/codex-sdk')> {
  return import('@openai/codex-sdk')
}
