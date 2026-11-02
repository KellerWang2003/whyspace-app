import { ElectronAPI } from '@electron-toolkit/preload'
import type { Decision, DecisionFilter, Project, ServerStatus } from '../shared/decisions'
import type { WhyspaceApi } from '../shared/api'

declare global {
  interface Window {
    electron: ElectronAPI
    whyspace: WhyspaceApi
    api: {
      listDecisions: (filter?: DecisionFilter) => Promise<Decision[]>
      confirmDecision: (id: number) => Promise<Decision | undefined>
      listProjects: () => Promise<{ projects: Project[]; activeId?: number }>
      createProject: (name: string, brief: string) => Promise<Project>
      updateProject: (id: number, fields: { name?: string; brief?: string }) => Promise<Project>
      selectProject: (id: number) => Promise<void>
      serverStatus: () => Promise<ServerStatus>
      onDataChanged: (callback: () => void) => () => void
    }
  }
}
