// Keeps a copy of the signed-in user's rows in the main process and live-updates it from
// Supabase Realtime. Windows read the copy and get each change pushed to them.
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient
} from '@supabase/supabase-js'
import type { DataChange, Row, Snapshot, SyncStatus } from '../shared/api'
import { SYNC_TABLES, SYNC_TABLE_NAMES, isSyncTable, type SyncTable } from '../shared/tables'
import { push } from './ipc'

// Enough for the debug window. Real screens will query what they show.
const ROW_LIMIT = 500

let db: SupabaseClient | undefined
let channel: RealtimeChannel | undefined
let snapshot: Snapshot = {}
let status: SyncStatus = { connection: 'off' }
let statusListener: (status: SyncStatus) => void = () => {}

export function syncSnapshot(): Snapshot {
  return snapshot
}

export function syncStatus(): SyncStatus {
  return status
}

// For the tray label. Windows hear the same thing as 'sync:status'.
export function onSyncStatus(listener: (status: SyncStatus) => void): void {
  statusListener = listener
}

function setStatus(next: SyncStatus): void {
  status = next
  push('sync:status', status)
  statusListener(status)
}

async function loadTable(table: string): Promise<void> {
  if (!db) return
  const { data, error } = await db.from(table).select('*').limit(ROW_LIMIT)
  snapshot[table] = error ? { rows: [], error: error.message } : { rows: data as Row[] }
  push('sync:table', { table, state: snapshot[table] })
}

export async function reloadAll(): Promise<void> {
  await Promise.all(SYNC_TABLE_NAMES.map(loadTable))
}

// Matches on the table's primary key; a delete only carries those columns.
function sameRow(table: SyncTable, a: Row, b: Row): boolean {
  return SYNC_TABLES[table].key.every((k) => a[k] !== undefined && a[k] === b[k])
}

function apply(payload: RealtimePostgresChangesPayload<Row>): void {
  const table = payload.table
  const current = snapshot[table]
  if (!isSyncTable(table) || !current) return
  const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Row
  let rows = current.rows.filter((r) => !sameRow(table, r, row))
  if (payload.eventType !== 'DELETE') rows = [row, ...rows]
  snapshot[table] = { ...current, rows }
  const change: DataChange = {
    table,
    event: payload.eventType,
    row,
    at: payload.commit_timestamp ?? new Date().toISOString()
  }
  push('sync:table', { table, state: snapshot[table], change })
  setStatus({ ...status, lastChange: change })
}

// Call when someone signs in. Safe to call again on token refresh; it only starts once.
export async function startSync(client: SupabaseClient): Promise<void> {
  if (channel) return
  db = client
  setStatus({ connection: 'connecting' })
  // Realtime only sends rows this user may see, and only for tables in the
  // supabase_realtime publication; the backend migration has to add them.
  channel = client
    .channel('whyspace-sync')
    .on('postgres_changes', { event: '*', schema: 'public' }, apply)
    .subscribe((state, err) => {
      if (state === 'SUBSCRIBED') {
        setStatus({ ...status, connection: 'live', error: undefined })
        // Covers changes missed while connecting or offline.
        reloadAll()
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        setStatus({ ...status, connection: 'error', error: err?.message ?? state })
      } else if (state === 'CLOSED') {
        setStatus({ ...status, connection: 'off' })
      }
    })
}

export async function stopSync(): Promise<void> {
  if (channel && db) await db.removeChannel(channel)
  channel = undefined
  snapshot = {}
  for (const table of SYNC_TABLE_NAMES) push('sync:table', { table, state: { rows: [] } })
  setStatus({ connection: 'off' })
}
