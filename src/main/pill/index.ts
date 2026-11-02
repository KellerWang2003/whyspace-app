import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import {
  PILL,
  PILL_OFFSET,
  PILL_WINDOW,
  type FrontContext,
  type PillInit,
  type Rect
} from '../../shared/pill'
import { requestAccess, watchFrontmost } from './frontmost'
import { clampToScreen, loadPosition, savePosition, type Point } from './position'

// The always-on-top pill: floats over other apps and full-screen spaces, expands to a
// panel on hover, click or the shortcut, can be dragged anywhere, and remembers where.
export const SHORTCUT = 'CommandOrControl+Shift+Y'

let pill: BrowserWindow | undefined
let position: Point
let context: FrontContext | undefined

const windowAt = (p: Point): Point => ({ x: p.x - PILL_OFFSET.x, y: p.y - PILL_OFFSET.y })

// The usable screen area around the pill, in the window's coordinates, so the window can
// work out which way the panel has room to open.
function workArea(): Rect {
  const area = screen.getDisplayNearestPoint({
    x: Math.round(position.x + PILL.width / 2),
    y: Math.round(position.y + PILL.height / 2)
  }).workArea
  const origin = windowAt(position)
  return { ...area, x: area.x - origin.x, y: area.y - origin.y }
}

function place(p: Point): void {
  position = p
  const { x, y } = windowAt(p)
  pill?.setBounds({ x, y, ...PILL_WINDOW })
}

// Puts the pill back on a screen after one is unplugged or rearranged.
function refit(): void {
  place(clampToScreen(position))
  pill?.webContents.send('pill:workarea', workArea())
}

function createWindow(): BrowserWindow {
  const { x, y } = windowAt(position)
  const win = new BrowserWindow({
    x,
    y,
    ...PILL_WINDOW,
    // A non-activating panel: it can float over full-screen apps, and clicking it doesn't
    // bring Whyspace to the front, so the app you're working in stays the frontmost one.
    type: 'panel',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    show: false,
    title: 'Whyspace pill',
    webPreferences: {
      preload: join(__dirname, '../preload/pill.js'),
      sandbox: false
    }
  })
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.once('ready-to-show', () => win.showInactive())
  win.on('blur', () => win.webContents.send('pill:blur'))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/pill.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/pill.html'))
  }
  return win
}

// Dragging: the window follows the cursor, read from the main process so a fast drag
// can't outrun it.
let drag: { timer: NodeJS.Timeout; cursor: Point; from: Point; moved: boolean } | undefined

function dragStart(): void {
  if (drag) return
  const cursor = screen.getCursorScreenPoint()
  const from = position
  drag = {
    cursor,
    from,
    moved: false,
    timer: setInterval(() => {
      if (!drag) return
      const now = screen.getCursorScreenPoint()
      const dx = now.x - drag.cursor.x
      const dy = now.y - drag.cursor.y
      // A few points of wobble is still a click.
      if (!drag.moved && Math.hypot(dx, dy) < 4) return
      drag.moved = true
      place({ x: drag.from.x + dx, y: drag.from.y + dy })
    }, 8)
  }
}

function dragEnd(): { moved: boolean } {
  if (!drag) return { moved: false }
  clearInterval(drag.timer)
  const { moved } = drag
  drag = undefined
  if (moved) {
    place(clampToScreen(position))
    savePosition(position)
    pill?.webContents.send('pill:workarea', workArea())
  }
  return { moved }
}

export function createPill(): void {
  if (pill) return
  position = loadPosition()

  ipcMain.handle('pill:init', (): PillInit => ({
    workArea: workArea(),
    context,
    shortcut: SHORTCUT
  }))
  ipcMain.on('pill:interactive', (_, on: boolean) => {
    pill?.setIgnoreMouseEvents(!on, { forward: true })
  })
  ipcMain.on('pill:drag-start', dragStart)
  ipcMain.handle('pill:drag-end', dragEnd)
  ipcMain.on('pill:focus', () => pill?.focus())
  ipcMain.on('pill:request-access', requestAccess)

  pill = createWindow()
  pill.on('closed', () => (pill = undefined))

  screen.on('display-removed', refit)
  screen.on('display-added', refit)
  screen.on('display-metrics-changed', refit)

  if (!globalShortcut.register(SHORTCUT, () => pill?.webContents.send('pill:shortcut'))) {
    console.error(`[whyspace pill] ${SHORTCUT} is taken by another app`)
  }

  const stop = watchFrontmost((next) => {
    context = next
    if (is.dev)
      console.log('[whyspace pill]', next.app.name, '·', next.file?.name ?? '-', next.access)
    pill?.webContents.send('pill:context', next)
  })
  app.on('will-quit', () => {
    stop()
    globalShortcut.unregister(SHORTCUT)
  })
}
