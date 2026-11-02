// The one typed API between the main process and every window (debug window now, pill and real screens later).
// Windows reach it as `window.whyspace`: `invoke` asks main for something, `on` hears what main pushes.

export interface User {
  id: string
  email?: string
  name?: string
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out'; error?: string; emailSentTo?: string }
  | { status: 'signed_in'; user: User }

export type Row = Record<string, unknown>

export interface TableState {
  rows: Row[]
  error?: string
}

// Every synced table by name. Rows are only the ones the signed-in user may see (row level security).
export type Snapshot = Record<string, TableState>

export interface DataChange {
  table: string
  event: 'INSERT' | 'UPDATE' | 'DELETE'
  row: Row
  at: string
}

export interface SyncStatus {
  connection: 'off' | 'connecting' | 'live' | 'error'
  error?: string
  lastChange?: DataChange
}

// A whyspace:// link someone opened, other than the sign-in callback.
export type WhyspaceLink =
  { kind: 'project' | 'decision'; id: string; url: string } | { kind: 'unknown'; url: string }

// Calls a window can make. The main process answers each one.
export interface Invokes {
  'auth:state': () => AuthState
  'auth:email-link': (email: string) => void
  'auth:sign-out': () => void
  'sync:snapshot': () => Snapshot
  'sync:status': () => SyncStatus
  'sync:reload': () => void
}

// Pushes from the main process to every window.
export interface Events {
  'auth:changed': AuthState
  'sync:table': { table: string; state: TableState; change?: DataChange }
  'sync:status': SyncStatus
  'link:opened': WhyspaceLink
}

// The preload only forwards channels on this list.
export const INVOKE_CHANNELS = [
  'auth:state',
  'auth:email-link',
  'auth:sign-out',
  'sync:snapshot',
  'sync:status',
  'sync:reload'
] as const satisfies readonly (keyof Invokes)[]

export const EVENT_CHANNELS = [
  'auth:changed',
  'sync:table',
  'sync:status',
  'link:opened'
] as const satisfies readonly (keyof Events)[]

export interface WhyspaceApi {
  invoke<K extends keyof Invokes>(
    channel: K,
    ...args: Parameters<Invokes[K]>
  ): Promise<ReturnType<Invokes[K]>>
  // Returns an unsubscribe function.
  on<K extends keyof Events>(channel: K, callback: (payload: Events[K]) => void): () => void
}
