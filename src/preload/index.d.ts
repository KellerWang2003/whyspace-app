import { ElectronAPI } from '@electron-toolkit/preload'
import type { WhyspaceApi } from '../shared/api'

declare global {
  interface Window {
    electron: ElectronAPI
    whyspace: WhyspaceApi
  }
}
