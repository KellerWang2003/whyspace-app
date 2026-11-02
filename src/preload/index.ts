import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Decision, DecisionFilter, Project, ServerStatus } from '../shared/decisions'

// Custom APIs for renderer
const api = {
  listDecisions: (filter: DecisionFilter = {}): Promise<Decision[]> =>
    ipcRenderer.invoke('decisions:list', filter),
  confirmDecision: (id: number): Promise<Decision | undefined> =>
    ipcRenderer.invoke('decisions:confirm', id),
  listProjects: (): Promise<{ projects: Project[]; activeId?: number }> =>
    ipcRenderer.invoke('projects:list'),
  createProject: (name: string, brief: string): Promise<Project> =>
    ipcRenderer.invoke('projects:create', name, brief),
  updateProject: (id: number, fields: { name?: string; brief?: string }): Promise<Project> =>
    ipcRenderer.invoke('projects:update', id, fields),
  selectProject: (id: number): Promise<void> => ipcRenderer.invoke('projects:select', id),
  serverStatus: (): Promise<ServerStatus> => ipcRenderer.invoke('server:status'),
  // Calls back whenever a decision or project changes. Returns an unsubscribe function.
  onDataChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('data:changed', listener)
    return () => ipcRenderer.removeListener('data:changed', listener)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
