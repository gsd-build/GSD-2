import { contextBridge } from 'electron'

export type StudioStatus = {
  connected: boolean
}

export type StudioBridge = {
  onEvent: (callback: (event: unknown) => void) => () => void
  sendCommand: (command: string, args?: Record<string, unknown>) => void
  spawn: () => void
  getStatus: () => Promise<StudioStatus>
}

const studio: StudioBridge = {
  onEvent: (_callback) => () => undefined,
  sendCommand: (_command, _args) => undefined,
  spawn: () => undefined,
  getStatus: () => Promise.resolve({ connected: false })
}

console.log('[studio] preload loaded')
contextBridge.exposeInMainWorld('studio', studio)
