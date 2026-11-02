import type { Database } from './database.types'

type Tables = Database['public']['Tables']

// Tables the app keeps in sync with Supabase, with the primary key columns used to match
// live changes to rows. `live` tables are in the supabase_realtime publication; the others
// only refresh on sign-in, reconnect or Reload. Typechecking fails if a name or key column
// isn't in the generated schema types.
export const SYNC_TABLES = {
  projects: { key: ['id'], live: false },
  project_members: { key: ['project_id', 'profile_id'], live: false },
  profiles: { key: ['id'], live: false },
  parts: { key: ['id'], live: false },
  milestones: { key: ['id'], live: false },
  decisions: { key: ['id'], live: true },
  decision_replies: { key: ['id'], live: true },
  decision_reach: { key: ['decision_id', 'artifact_id'], live: true },
  artifacts: { key: ['id'], live: true },
  tasks: { key: ['id'], live: true },
  meetings: { key: ['id'], live: true },
  inbox_items: { key: ['id'], live: true },
  activity: { key: ['project_id', 'profile_id'], live: true }
} as const satisfies {
  [T in keyof Tables]?: { key: readonly (keyof Tables[T]['Row'])[]; live: boolean }
}

export type SyncTable = keyof typeof SYNC_TABLES

export const SYNC_TABLE_NAMES = Object.keys(SYNC_TABLES) as SyncTable[]

export function isSyncTable(name: string): name is SyncTable {
  return name in SYNC_TABLES
}
