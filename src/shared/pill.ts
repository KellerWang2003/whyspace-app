// Types and sizes shared by the pill's main process code, preload and window.

// The collapsed pill and the expanded panel, in points.
export const PILL = { width: 48, height: 112 }
export const PANEL = { width: 320, height: 440 }
// Room around the panel for its shadow.
export const MARGIN = 24

// The pill window never resizes. It is big enough for the panel to open in any direction
// from the pill, which sits in its middle. Everything outside the visible box lets clicks
// through, so the box can morph between pill and panel without the window moving.
export const PILL_WINDOW = {
  width: 2 * PANEL.width - PILL.width + 2 * MARGIN,
  height: 2 * PANEL.height - PILL.height + 2 * MARGIN
}
// Where the pill sits inside the window.
export const PILL_OFFSET = {
  x: MARGIN + PANEL.width - PILL.width,
  y: MARGIN + PANEL.height - PILL.height
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// What the person is working in right now.
export interface FrontContext {
  app: { name: string; bundleId?: string; icon?: string }
  // The open document, from the focused window. Needs Accessibility access.
  file?: { name: string; path?: string }
  access: 'granted' | 'needed'
}

// A decision the AI caught in a chat, waiting in the panel for the person to confirm.
export interface PillDecision {
  id: string
  title: string
  why?: string
  // The reason is the AI's guess, not something the person said.
  guessed?: boolean
  // The person sounded unsure, so it stays open until they decide.
  unsure?: boolean
  confirmed: boolean
}

// Confirm, change the reason, or null to remove.
export type DecisionPatch = Partial<Pick<PillDecision, 'why' | 'guessed' | 'confirmed'>> | null

export interface PillInit {
  // The usable screen area around the pill, in the window's own coordinates.
  workArea: Rect
  context?: FrontContext
  decisions: PillDecision[]
  shortcut: string
}

export interface PillApi {
  init: () => Promise<PillInit>
  // Clicks reach the window only while the pointer is over the box.
  setInteractive: (on: boolean) => void
  // The main process moves the window with the cursor until dragEnd. Resolves whether it moved.
  dragStart: () => void
  dragEnd: () => Promise<{ moved: boolean }>
  focus: () => void
  requestAccess: () => void
  updateDecision: (id: string, patch: DecisionPatch) => void
  onShortcut: (callback: () => void) => () => void
  onBlur: (callback: () => void) => () => void
  onWorkArea: (callback: (workArea: Rect) => void) => () => void
  onContext: (callback: (context: FrontContext) => void) => () => void
  onDecisions: (callback: (decisions: PillDecision[]) => void) => () => void
}
