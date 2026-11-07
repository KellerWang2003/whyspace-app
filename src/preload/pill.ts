import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { FrontContext, PillApi, PillDecision, Rect } from '../shared/pill'

// Subscribes to one channel from the main process. Returns an unsubscribe function.
function on<T extends unknown[]>(channel: string, callback: (...args: T) => void): () => void {
  const listener = (_: IpcRendererEvent, ...args: unknown[]): void => callback(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// The pill window's only API. Other channels the main process broadcasts are ignored.
const pill: PillApi = {
  init: () => ipcRenderer.invoke('pill:init'),
  setInteractive: (value) => ipcRenderer.send('pill:interactive', value),
  dragStart: () => ipcRenderer.send('pill:drag-start'),
  dragEnd: () => ipcRenderer.invoke('pill:drag-end'),
  focus: () => ipcRenderer.send('pill:focus'),
  requestAccess: () => ipcRenderer.send('pill:request-access'),
  updateDecision: (id, patch) => ipcRenderer.send('pill:update-decision', id, patch),
  onShortcut: (callback) => on('pill:shortcut', callback),
  onBlur: (callback) => on('pill:blur', callback),
  onWorkArea: (callback) => on<[Rect]>('pill:workarea', callback),
  onContext: (callback) => on<[FrontContext]>('pill:context', callback),
  onDecisions: (callback) => on<[PillDecision[]]>('pill:decisions', callback)
}

contextBridge.exposeInMainWorld('pill', pill)
