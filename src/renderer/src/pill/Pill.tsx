import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import {
  PANEL,
  PILL,
  PILL_OFFSET,
  type DecisionPatch,
  type FrontContext,
  type PillDecision,
  type Rect
} from '../../../shared/pill'

// Placeholder visuals in grayscale. The motion follows the wireframe's desktop overlay:
// the box morphs between pill and panel, content fades in after it, nothing jumps.
const OPEN_DELAY = 200
// Close after a beat so brushing past the edge doesn't flicker.
const CLOSE_DELAY = 220
// How long a confirmed or removed row takes to fold away.
const FOLD = 240
const GAP = 8

const pillRect: Rect = { ...PILL_OFFSET, ...PILL }

// The panel opens toward the side of the screen with more room, centered on the pill
// and kept inside the screen. Worked out when it opens, then held while it's open.
function panelRectFor(area: Rect, height: number): Rect {
  const growLeft = pillRect.x + PILL.width / 2 > area.x + area.width / 2
  const x = growLeft ? pillRect.x + PILL.width - PANEL.width : pillRect.x
  const centered = pillRect.y + PILL.height / 2 - height / 2
  const lowest = Math.min(area.y + area.height - GAP - height, pillRect.y)
  const highest = Math.max(area.y + GAP, pillRect.y + PILL.height - height)
  const y = Math.min(Math.max(centered, highest), lowest)
  return { x, y, width: PANEL.width, height }
}

// While open, the panel keeps its top and grows or shrinks with its rows, moving up only
// if it would run off the bottom of the screen.
function refitPanel(panel: Rect, area: Rect, height: number): Rect {
  const y = Math.max(area.y + GAP, Math.min(panel.y, area.y + area.height - GAP - height))
  return { ...panel, y, height }
}

// "CommandOrControl+Shift+Y" → "⌘⇧Y"
const keys = (accelerator: string): string =>
  accelerator
    .replace('CommandOrControl', '⌘')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .replace(/\+/g, '')

export function Pill(): React.JSX.Element {
  const [workArea, setWorkArea] = useState<Rect>()
  const [context, setContext] = useState<FrontContext>()
  const [decisions, setDecisions] = useState<PillDecision[]>([])
  const [shortcut, setShortcut] = useState('')
  const [hovered, setHoveredNow] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [panel, setPanel] = useState<Rect>()
  const [wasExpanded, setWasExpanded] = useState(false)
  const [contentHeight, setContentHeight] = useState(PANEL.height)
  const timer = useRef<number | undefined>(undefined)
  const dragging = useRef(false)
  const content = useRef<HTMLDivElement>(null)
  const expanded = hovered || pinned

  useEffect(() => {
    window.pill.init().then((init) => {
      setWorkArea(init.workArea)
      setContext(init.context)
      setDecisions(init.decisions)
      setShortcut(init.shortcut)
    })
    const offs = [
      window.pill.onWorkArea(setWorkArea),
      window.pill.onContext(setContext),
      window.pill.onDecisions(setDecisions),
      window.pill.onBlur(() => setPinned(false)),
      window.pill.onShortcut(() =>
        setPinned((was) => {
          if (!was) window.pill.focus()
          return !was
        })
      )
    ]
    return () => offs.forEach((off) => off())
  }, [])

  // The panel is as tall as its content, up to PANEL.height; past that its list scrolls.
  useLayoutEffect(() => {
    const el = content.current
    if (!el) return
    const observer = new ResizeObserver(() => setContentHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Work out where the panel goes each time it opens. It stays put while closing, so the
  // box can shrink back over it.
  if (expanded !== wasExpanded) {
    setWasExpanded(expanded)
    if (expanded && workArea) setPanel(panelRectFor(workArea, contentHeight))
  }
  if (expanded && panel && workArea && panel.height !== contentHeight) {
    setPanel(refitPanel(panel, workArea, contentHeight))
  }
  const box = expanded && panel ? panel : pillRect
  const panelAt = panel ?? pillRect

  function setHovered(on: boolean): void {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setHoveredNow(on), on ? OPEN_DELAY : CLOSE_DELAY)
  }

  // Press and move to drag, from the pill or the panel's header. A press without moving
  // is a click: on the pill it opens or closes the panel.
  function pointerDown(e: PointerEvent): void {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    window.clearTimeout(timer.current)
    dragging.current = true
    window.pill.dragStart()
  }
  async function pointerUp(onClick?: () => void): Promise<void> {
    if (!dragging.current) return
    dragging.current = false
    const { moved } = await window.pill.dragEnd()
    if (!moved) onClick?.()
  }

  // Typing needs keyboard focus, and the panel shouldn't close under the cursor while
  // someone is typing a reason.
  function holdOpen(): void {
    setPinned(true)
    window.pill.focus()
  }

  const file = context?.file?.name
  const waiting = decisions.filter((d) => !d.confirmed)
  const confirmed = decisions.filter((d) => d.confirmed)

  return (
    <section
      aria-label="Whyspace"
      className={expanded ? 'box expanded' : 'box'}
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      onMouseEnter={() => {
        window.pill.setInteractive(true)
        if (!dragging.current) setHovered(true)
      }}
      onMouseLeave={() => {
        if (dragging.current) return
        window.pill.setInteractive(false)
        setHovered(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) {
          setPinned(false)
          setHoveredNow(false)
        }
      }}
    >
      <div
        className="pill-content"
        aria-hidden={expanded}
        style={{ left: pillRect.x - box.x, top: pillRect.y - box.y }}
        onPointerDown={pointerDown}
        onPointerUp={() =>
          pointerUp(() => {
            setPinned((was) => !was)
            window.pill.focus()
          })
        }
        onPointerCancel={() => pointerUp()}
      >
        <YMark className="mark" />
        <AppIcon context={context} size={20} />
        {waiting.length > 0 && (
          <span className="count" key={waiting.length} title={`${waiting.length} to confirm`}>
            {waiting.length}
          </span>
        )}
      </div>

      <div
        ref={content}
        className="panel-content"
        aria-hidden={!expanded}
        style={{ left: panelAt.x - box.x, top: panelAt.y - box.y }}
      >
        <header
          className="panel-header"
          onPointerDown={pointerDown}
          onPointerUp={() => pointerUp()}
          onPointerCancel={() => pointerUp()}
        >
          <YMark className="logo" />
          <span className="where">No project yet</span>
          {shortcut && <kbd>{keys(shortcut)}</kbd>}
        </header>

        {context && (
          <div className="using" key={`${context.app.name}/${file}`}>
            <AppIcon context={context} size={14} />
            <span className="truncate">
              {context.app.name}
              {file && <span className="muted"> · {file}</span>}
            </span>
          </div>
        )}

        {context?.access === 'needed' && (
          <div className="access">
            <p>Turn on Accessibility so Whyspace can see which file you have open.</p>
            <button type="button" onClick={() => window.pill.requestAccess()}>
              Allow access
            </button>
          </div>
        )}

        <div className="body">
          {waiting.length ? (
            <>
              <div className="section-title">
                <span>To confirm</span>
                <span className="muted">{waiting.length}</span>
              </div>
              <ul className="rows">
                {waiting.map((d) => (
                  <DecisionRow
                    key={d.id}
                    decision={d}
                    onEdit={holdOpen}
                    onUpdate={(patch) => window.pill.updateDecision(d.id, patch)}
                  />
                ))}
              </ul>
            </>
          ) : (
            <p className="muted empty">Nothing to confirm</p>
          )}

          {confirmed.length > 0 && (
            <>
              <div className="section-title confirmed-title">
                <span>Confirmed</span>
                <span className="muted">{confirmed.length}</span>
              </div>
              <ul className="rows">
                {confirmed.map((d) => (
                  <li key={d.id} className="row done">
                    <div className="row-inner">
                      <Check />
                      <div className="row-text">
                        <p>{d.title}</p>
                        {d.why && <p className="muted">{d.why}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

// One caught decision: confirm it, check or change the reason, or remove it.
function DecisionRow({
  decision: d,
  onUpdate,
  onEdit
}: {
  decision: PillDecision
  onUpdate: (patch: DecisionPatch) => void
  onEdit: () => void
}): React.JSX.Element {
  const [leaving, setLeaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [why, setWhy] = useState(d.why ?? '')

  // Folds the row away first, so it doesn't vanish mid-list.
  function fold(patch: DecisionPatch): void {
    setLeaving(true)
    window.setTimeout(() => onUpdate(patch), FOLD)
  }
  function edit(): void {
    setWhy(d.why ?? '')
    setEditing(true)
    onEdit()
  }
  function save(): void {
    const next = why.trim()
    if (next) onUpdate({ why: next, guessed: false })
    setEditing(false)
  }

  return (
    <li className={leaving ? 'row leaving' : 'row'}>
      <div className="row-inner">
        <span
          className={d.unsure ? 'status unsure' : 'status'}
          title={d.unsure ? 'Not decided' : 'Caught from your chat'}
        />
        <div className="row-text">
          <p>
            {d.title}
            {d.unsure && <span className="tag">Not sure</span>}
          </p>

          {editing ? (
            <form
              className="reason-form"
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
            >
              <input
                autoFocus
                aria-label={`Reason for ${d.title}`}
                placeholder="Why?"
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
                onBlur={save}
              />
            </form>
          ) : d.why ? (
            <button type="button" className="reason" onClick={edit} title="Change the reason">
              {d.guessed && <span className="tag">Guess</span>}
              {d.why}
            </button>
          ) : (
            <button type="button" className="reason add" onClick={edit}>
              Add a reason
            </button>
          )}
        </div>
        {!editing && (
          <button type="button" className="confirm" onClick={() => fold({ confirmed: true })}>
            Confirm
          </button>
        )}
        <button
          type="button"
          className="remove"
          aria-label={`Remove ${d.title}`}
          title="Remove"
          onClick={() => fold(null)}
        >
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </li>
  )
}

function Check(): React.JSX.Element {
  return (
    <svg className="status-check" viewBox="0 0 12 12" width="12" height="12" aria-label="Confirmed">
      <path
        d="M2.5 6.5l2.5 2.5 4.5-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Keller's Y mark (logo round 8), in the text color.
function YMark({ className }: { className: string }): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 419.6 528.9" aria-label="Whyspace" role="img">
      <path
        fill="currentColor"
        d="M16.6 13.3L15.3 12.6L13.9 12.1L12.5 11.8L11.1 11.7L9.6 11.8L8.2 12.1L6.8 12.5L5.5 13.1L4.3 13.9L3.3 14.9L2.3 16.0L1.5 17.2L0.6 19.1L0.2 20.5L0.0 21.9L0.0 149.5L0.2 151.0L0.6 152.4L1.5 154.4L2.4 155.6L3.3 156.7L5.0 158.0L6.3 158.7L123.8 213.4L125.9 214.1L127.3 214.4L128.8 214.4L131.0 214.1L132.4 213.7L134.4 212.7L135.5 211.8L211.8 146.7L212.8 145.7L213.7 144.6L214.8 142.7L215.4 140.7L215.6 138.6L215.5 136.4L214.9 134.4L213.9 132.5L212.6 130.8L210.9 129.4ZM419.6 11.0L419.5 9.5L419.2 8.1L418.4 6.1L417.7 4.9L416.9 3.8L415.9 2.8L414.7 1.9L413.5 1.2L412.2 0.6L410.8 0.2L409.4 0.0L408.0 0.0L405.9 0.3L404.5 0.8L403.3 1.4L402.1 2.2L144.3 222.1L142.7 223.7L141.6 225.5L141.0 226.9L140.5 229.0L140.4 230.5L140.4 344.0L140.5 345.5L140.8 346.9L141.5 348.9L142.7 350.7L143.6 351.8L144.7 352.7L145.9 353.5L147.8 354.4L149.9 354.9L151.3 355.0L153.4 354.8L154.8 354.4L156.8 353.5L158.0 352.8L415.2 158.0L416.3 157.0L417.3 156.0L418.1 154.8L419.0 152.8L419.5 150.7L419.6 149.2ZM302.4 282.4L302.3 280.9L302.0 279.5L301.6 278.2L300.9 276.9L300.1 275.7L299.2 274.6L298.1 273.7L296.9 272.9L295.0 272.0L293.6 271.6L292.2 271.5L290.8 271.4L289.3 271.6L288.0 272.0L286.6 272.5L285.4 273.2L144.7 379.7L143.7 380.7L142.3 382.3L141.6 383.6L140.8 385.6L140.5 387.0L140.4 388.4L140.4 518.0L140.5 519.4L140.8 520.8L141.2 522.1L141.9 523.4L142.7 524.6L143.6 525.7L145.3 527.1L146.5 527.8L147.8 528.3L149.9 528.8L151.3 528.9L153.4 528.7L154.8 528.4L156.1 527.8L157.4 527.1L298.0 420.6L299.1 419.7L300.5 418.0L301.2 416.8L301.8 415.4L302.3 413.3L302.4 411.9Z"
      />
    </svg>
  )
}

// The app's own icon, or its first letter while the icon loads or if there is none.
function AppIcon({ context, size }: { context?: FrontContext; size: number }): React.JSX.Element {
  const name = context?.app.name ?? ''
  return context?.app.icon ? (
    <img className="app-icon" src={context.app.icon} width={size} height={size} alt={name} />
  ) : (
    <span
      className="app-icon blank"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
      title={name}
    >
      {name.charAt(0)}
    </span>
  )
}
