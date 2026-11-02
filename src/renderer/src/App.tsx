import { useCallback, useEffect, useRef, useState } from 'react'
import type { Decision, DecisionStatus, Project, ServerStatus } from '../../shared/decisions'
import ProjectBar from './components/ProjectBar'

type Tab = 'all' | DecisionStatus

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ai_guess', label: 'AI guesses' },
  { id: 'confirmed', label: 'Confirmed' }
]

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function App(): React.JSX.Element {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [status, setStatus] = useState<ServerStatus>()
  const [projects, setProjects] = useState<Project[]>([])
  const [activeId, setActiveId] = useState<number>()
  const [tab, setTab] = useState<Tab>('all')
  const [part, setPart] = useState('')
  const [fresh, setFresh] = useState<Set<number>>(new Set())
  const seen = useRef<Set<number> | null>(null)
  const seenProject = useRef<number | undefined>(undefined)

  const load = useCallback(async () => {
    setStatus(await window.api.serverStatus())
    const list = await window.api.listProjects()
    setProjects(list.projects)
    setActiveId(list.activeId)
    const rows = await window.api.listDecisions({
      project_id: list.activeId,
      part: part || undefined,
      status: tab === 'all' ? undefined : tab
    })
    // Highlight decisions that arrived since the last load.
    if (seen.current && list.activeId === seenProject.current) {
      const added = rows.filter((d) => !seen.current!.has(d.id)).map((d) => d.id)
      if (added.length) {
        setFresh(new Set(added))
        setTimeout(() => setFresh(new Set()), 2500)
      }
    }
    if (list.activeId !== seenProject.current) seen.current = new Set()
    seenProject.current = list.activeId
    seen.current = new Set([...(seen.current ?? []), ...rows.map((d) => d.id)])
    setDecisions(rows)
  }, [part, tab])

  useEffect(() => {
    // Fetching from the main process on mount, then on every change it reports.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    return window.api.onDataChanged(load)
  }, [load])

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Decisions</h1>
          <p className="subtitle">Saved by Claude while you chat. Only you can confirm them.</p>
        </div>
        {status && (
          <div className={`server ${status.running ? 'on' : 'off'}`} title={status.dbPath}>
            <span className="dot" />
            {status.mode === 'hosted' ? (
              status.running ? (
                <>
                  <span>Hosted server connected</span>
                  {/* The connector URL holds a secret, so copy it instead of showing it. */}
                  <button
                    className="link"
                    onClick={() => navigator.clipboard.writeText(status.url)}
                  >
                    Copy connector URL
                  </button>
                </>
              ) : (
                <span>Can&apos;t reach the hosted server: {status.error}</span>
              )
            ) : status.running ? (
              <span>
                MCP server running at <code>{status.url}</code>
              </span>
            ) : (
              <span>MCP server stopped: {status.error}</span>
            )}
          </div>
        )}
      </header>

      <ProjectBar projects={projects} activeId={activeId} />

      <div className="toolbar">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="search"
          placeholder="Filter by part, e.g. home page"
          value={part}
          onChange={(e) => setPart(e.target.value)}
        />
      </div>

      {decisions.length === 0 ? (
        <div className="empty">
          <p>No decisions yet.</p>
          <p className="hint">
            In Claude desktop, try: “Record a decision: the home page is dark because people work
            late.”
          </p>
        </div>
      ) : (
        <ul className="list">
          {decisions.map((d) => (
            <li key={d.id} className={`card ${d.status} ${fresh.has(d.id) ? 'fresh' : ''}`}>
              <div className="card-top">
                <span className="part">{d.part}</span>
                <span className="id">#{d.id}</span>
              </div>
              <h2>{d.title}</h2>
              <p className="why">
                <span>Why</span> {d.why}
              </p>
              <div className="card-bottom">
                <span className="meta">
                  Recorded by {d.made_by} · {formatTime(d.created_at)}
                </span>
                {d.status === 'confirmed' ? (
                  <span className="badge confirmed">
                    Confirmed by {d.confirmed_by}
                    {d.confirmed_at ? ` · ${formatTime(d.confirmed_at)}` : ''}
                  </span>
                ) : (
                  <div className="actions">
                    <span className="badge guess">AI guess</span>
                    <button className="confirm" onClick={() => window.api.confirmDecision(d.id)}>
                      Confirm
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default App
