import type { PillApi } from '../shared/pill'

declare global {
  interface Window {
    pill: PillApi
  }
}
