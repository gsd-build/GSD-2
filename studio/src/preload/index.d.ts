import type { StudioBridge } from './index'

declare global {
  interface Window {
    studio: StudioBridge
  }
}

export {}
