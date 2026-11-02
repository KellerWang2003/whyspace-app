import { useState } from 'react'
import type { Project } from '../../../shared/decisions'

type Mode = 'closed' | 'edit' | 'new'

function claudeInstruction(name: string): string {
  return `This chat is part of the Whyspace project "${name}". At the start of every chat, call the Whyspace get_project_context tool. Whenever we settle a decision, record it with Whyspace's record_decision without being asked, and check list_decisions before answering questions about past decisions.`
}

function ProjectBar({
  projects,
  activeId
}: {
  projects: Project[]
  activeId?: number
}): React.JSX.Element {
  const active = projects.find((p) => p.id === activeId)
  const [mode, setMode] = useState<Mode>('closed')
  const [name, setName] = useState('')
  const [brief, setBrief] = useState('')
  const [copied, setCopied] = useState(false)

  // Fill the form when it opens, not on every refresh, so typing isn't wiped
  // when Claude records a decision in the background.
  function open(next: Mode): void {
    if (next === mode) return setMode('closed')
    setName(next === 'edit' && active ? active.name : '')
    setBrief(next === 'edit' && active ? active.brief : '')
    setMode(next)
  }

  async function save(): Promise<void> {
    if (!name.trim()) return
    if (mode === 'new') await window.api.createProject(name, brief)
    else if (active) await window.api.updateProject(active.id, { name, brief })
    setMode('closed')
  }

  async function copyInstruction(): Promise<void> {
    if (!active) return
    await navigator.clipboard.writeText(claudeInstruction(active.name))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="project">
      <div className="project-row">
        <label className="project-label" htmlFor="project-select">
          Project
        </label>
        <select
          id="project-select"
          value={activeId ?? ''}
          onChange={(e) => window.api.selectProject(Number(e.target.value))}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="ghost" onClick={() => open('edit')}>
          {mode === 'edit' ? 'Close' : 'Edit brief'}
        </button>
        <button className="ghost" onClick={() => open('new')}>
          {mode === 'new' ? 'Cancel' : 'New project'}
        </button>
        <span className="project-note">Claude saves new decisions here.</span>
      </div>

      {mode === 'closed' && active && (
        <p className="brief">
          {active.brief || 'No brief yet. Claude reads this to understand the project.'}
        </p>
      )}

      {mode !== 'closed' && (
        <div className="project-form">
          <input
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            rows={3}
            placeholder="Brief: what the project is and who it's for. Claude reads this at the start of each chat."
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
          <div className="form-actions">
            {mode === 'edit' && (
              <button className="ghost" onClick={copyInstruction}>
                {copied ? 'Copied' : 'Copy Claude Project instruction'}
              </button>
            )}
            <button className="confirm" onClick={save} disabled={!name.trim()}>
              {mode === 'new' ? 'Create and select' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default ProjectBar
