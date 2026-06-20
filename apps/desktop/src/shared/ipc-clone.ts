/** Strip Vue proxies and other non-cloneable values before Electron IPC transfer. */
export function cloneForIpc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
