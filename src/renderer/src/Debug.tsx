// Plain debug window: sign-in, sync status and the raw rows the main process keeps in sync.
// Not a designed screen; it exists to prove the plumbing works.
import { useEffect, useState } from 'react'
import type { AuthState, Row, Snapshot, SyncStatus, WhyspaceLink } from '../../shared/api'
import { SYNC_TABLES, SYNC_TABLE_NAMES, type SyncTable } from '../../shared/tables'
import './assets/debug.css'

const api = window.whyspace

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function SignIn({
  auth
}: {
  auth: Extract<AuthState, { status: 'signed_out' }>
}): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    await action()
    setBusy(false)
  }
  return (
    <section className="box">
      <h2>Sign in</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(() => api.invoke('auth:send-email', email))
        }}
      >
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button disabled={busy}>{auth.emailSentTo ? 'Send a new code' : 'Email me a code'}</button>
      </form>
      {auth.emailSentTo && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run(() => api.invoke('auth:verify-code', code))
          }}
        >
          <p>
            Sent to {auth.emailSentTo}. Type the code from the email here; don&apos;t click its
            link. The first code also creates your account.
          </p>
          <input
            placeholder="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
          <button disabled={busy || !code.trim()}>Sign in</button>
        </form>
      )}
      {auth.error && <p className="error">{auth.error}</p>}
    </section>
  )
}

function TableView({
  name,
  rows,
  error,
  changed
}: {
  name: SyncTable
  rows: Row[]
  error?: string
  changed?: Row
}): React.JSX.Element {
  const { key, live } = SYNC_TABLES[name]
  const columns = [...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r)))]
  const rowKey = (r: Row): string => key.map((k) => cell(r[k])).join(':')
  return (
    <section className="box">
      <h3>
        {name}{' '}
        <span className="muted">
          {error ? '' : `${rows.length} rows · `}
          {live ? 'live' : 'refreshes on reload'}
        </span>
      </h3>
      {error ? (
        <p className="error">{error}</p>
      ) : rows.length === 0 ? (
        <p className="muted">No rows.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((r) => (
                <tr
                  key={rowKey(r)}
                  className={changed && rowKey(changed) === rowKey(r) ? 'fresh' : ''}
                >
                  {columns.map((c) => (
                    <td key={c} title={cell(r[c])}>
                      {cell(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function Debug(): React.JSX.Element {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })
  const [sync, setSync] = useState<SyncStatus>({ connection: 'off' })
  const [snapshot, setSnapshot] = useState<Snapshot>({})
  const [link, setLink] = useState<WhyspaceLink>()

  useEffect(() => {
    document.title = 'Whyspace debug'
    api.invoke('auth:state').then(setAuth)
    api.invoke('sync:status').then(setSync)
    api.invoke('sync:snapshot').then(setSnapshot)
    const off = [
      api.on('auth:changed', setAuth),
      api.on('sync:status', setSync),
      api.on('sync:table', ({ table, state }) => setSnapshot((s) => ({ ...s, [table]: state }))),
      api.on('link:opened', setLink)
    ]
    return () => off.forEach((f) => f())
  }, [])

  const last = sync.lastChange

  return (
    <div className="debug">
      <header>
        <h1>Whyspace debug</h1>
        {auth.status === 'signed_in' && (
          <p>
            Signed in as {auth.user.email ?? auth.user.id}
            {auth.user.name ? ` (${auth.user.name})` : ''} ·{' '}
            <span className={`sync ${sync.connection}`}>{sync.connection}</span>
            {sync.error ? ` · ${sync.error}` : ''} ·{' '}
            <button onClick={() => api.invoke('sync:reload')}>Reload</button>{' '}
            <button onClick={() => api.invoke('auth:sign-out')}>Sign out</button>
          </p>
        )}
      </header>

      {link && (
        <p className="box">
          Opened link: {link.kind === 'unknown' ? link.url : `${link.kind} ${link.id}`}
        </p>
      )}

      {auth.status === 'loading' && <p className="muted">Checking sign-in…</p>}
      {auth.status === 'signed_out' && <SignIn auth={auth} />}
      {auth.status === 'signed_in' && (
        <>
          <p className="muted">
            {last
              ? `Last change: ${last.event} on ${last.table} at ${new Date(last.at).toLocaleTimeString()}`
              : 'No live changes yet.'}
          </p>
          {SYNC_TABLE_NAMES.map((t) => (
            <TableView
              key={t}
              name={t}
              rows={snapshot[t]?.rows ?? []}
              error={snapshot[t]?.error}
              changed={last?.table === t ? last.row : undefined}
            />
          ))}
        </>
      )}
    </div>
  )
}
