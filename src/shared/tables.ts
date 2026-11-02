// Tables the app keeps in sync with Supabase. The names follow the plan for the backend schema
// (workstream 2); update this list when the schema lands. A table that doesn't exist yet shows
// its error in the debug window instead of breaking the rest.
export const SYNC_TABLES = [
  'projects',
  'project_members',
  'parts',
  'decisions',
  'artifacts',
  'tasks',
  'meetings',
  'inbox_items',
  'activity'
] as const

export type SyncTable = (typeof SYNC_TABLES)[number]
