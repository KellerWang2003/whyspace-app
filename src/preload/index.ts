import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type WhyspaceApi } from '../shared/api'

// The typed app API (shared/api.ts). Only channels on its lists get through.
const whyspace: WhyspaceApi = {
  invoke: (channel, ...args) => {
    if (!(INVOKE_CHANNELS as readonly string[]).includes(channel)) {
      return Promise.reject(new Error(`Unknown channel ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel, callback) => {
    if (!(EVENT_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(`Unknown channel ${channel}`)
    }
    const listener = (_: unknown, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('whyspace', whyspace)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.whyspace = whyspace
}
