export async function loadCursorSdk(): Promise<typeof import('@cursor/sdk')> {
  return import('@cursor/sdk')
}
