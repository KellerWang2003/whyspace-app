import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { PANEL, PILL, PILL_OFFSET, type FrontContext, type Rect } from '../../../shared/pill'

// Placeholder visuals in grayscale. The motion follows the wireframe's desktop overlay:
// the box morphs between pill and panel, content fades in after it, nothing jumps.
const OPEN_DELAY = 200
// Close after a beat so brushing past the edge doesn't flicker.
const CLOSE_DELAY = 220

const pillRect: Rect = { ...PILL_OFFSET, ...PILL }

// The panel opens toward the side of the screen with more room, centered on the pill
// and kept inside the screen. Worked out when it opens, then held while it's open.
function panelRectFor(area: Rect): Rect {
  const growLeft = pillRect.x + PILL.width / 2 > area.x + area.width / 2
  const x = growLeft ? pillRect.x + PILL.width - PANEL.width : pillRect.x
  const centered = pillRect.y + PILL.height / 2 - PANEL.height / 2
  const lowest = Math.min(area.y + area.height - 8 - PANEL.height, pillRect.y)
  const highest = Math.max(area.y + 8, pillRect.y + PILL.height - PANEL.height)
  const y = Math.min(Math.max(centered, highest), lowest)
  return { x, y, ...PANEL }
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
  const [shortcut, setShortcut] = useState('')
  const [hovered, setHoveredNow] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [panel, setPanel] = useState<Rect>()
  const [wasExpanded, setWasExpanded] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const dragging = useRef(false)
  const expanded = hovered || pinned

  useEffect(() => {
    window.pill.init().then((init) => {
      setWorkArea(init.workArea)
      setContext(init.context)
      setShortcut(init.shortcut)
    })
    const offs = [
      window.pill.onWorkArea(setWorkArea),
      window.pill.onContext(setContext),
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

  // Work out where the panel goes each time it opens. It stays put while closing, so the
  // box can shrink back over it.
  if (expanded !== wasExpanded) {
    setWasExpanded(expanded)
    if (expanded && workArea) setPanel(panelRectFor(workArea))
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

  const file = context?.file?.name

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
        if (e.key === 'Escape') {
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
        <span className="mark">Y</span>
        <AppIcon context={context} size={20} />
        <span className="count" title="Decisions">
          0
        </span>
      </div>

      <div
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
          <span className="logo">Y</span>
          <span className="where">No project yet</span>
          {shortcut && <kbd>{keys(shortcut)}</kbd>}
        </header>

        {context && (
          <div className="using" key={`${context.app.name}/${file}`}>
            <AppIcon context={context} size={14} />
            <span className="muted">Using</span>
            <span className="truncate">
              {context.app.name}
              {file && <span className="muted"> · </span>}
              {file}
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
          <div className="section-title">
            <span>Open</span>
            <span className="muted">0</span>
          </div>
          <p className="muted">No decisions yet</p>
        </div>

        <footer>
          <button type="button" className="outline" disabled>
            Start live
          </button>
        </footer>
      </div>
    </section>
  )
}

function AppIcon({ context, size }: { context?: FrontContext; size: number }): React.JSX.Element {
  const name = context?.app.name ?? ''
  return context?.app.icon ? (
    <img className="app-icon" src={context.app.icon} width={size} height={size} alt={name} />
  ) : (
    <span className="app-icon blank" style={{ width: size, height: size }} title={name} />
  )
}
