// The menu bar icon. It keeps Whyspace running with no windows open.
import { Menu, Tray, nativeImage } from 'electron'
import icon from '../../resources/icon.png?asset'
import type { AuthState, SyncStatus } from '../shared/api'

let tray: Tray | undefined

interface TrayActions {
  openDebug: () => void
  signOut: () => void
  // The pill's test decisions (Week 7 task 2), loaded or cleared from here.
  testDecisions: { loaded: () => boolean; toggle: () => void }
}

const SYNC_LABEL: Record<SyncStatus['connection'], string> = {
  off: 'Sync off',
  connecting: 'Connecting…',
  live: 'Live',
  error: 'Sync error'
}

// Placeholder: the app icon shrunk down, until the brand work makes a menu bar glyph.
export function createTray(actions: TrayActions): void {
  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  tray.setToolTip('Whyspace')
  tray.on('click', () => process.platform !== 'darwin' && actions.openDebug())
  updateTray({ status: 'loading' }, { connection: 'off' }, actions)
}

export function updateTray(auth: AuthState, sync: SyncStatus, actions: TrayActions): void {
  if (!tray) return
  const who =
    auth.status === 'signed_in'
      ? `Signed in as ${auth.user.email ?? auth.user.name ?? auth.user.id}`
      : auth.status === 'loading'
        ? 'Checking sign-in…'
        : 'Signed out'
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: who, enabled: false },
      ...(auth.status === 'signed_in'
        ? [{ label: SYNC_LABEL[sync.connection], enabled: false }]
        : []),
      { type: 'separator' },
      {
        label: auth.status === 'signed_in' ? 'Open debug window' : 'Sign in…',
        click: actions.openDebug
      },
      { label: 'Sign out', enabled: auth.status === 'signed_in', click: actions.signOut },
      { type: 'separator' },
      {
        label: actions.testDecisions.loaded() ? 'Clear test decisions' : 'Load test decisions',
        click: actions.testDecisions.toggle
      },
      { type: 'separator' },
      { label: 'Quit Whyspace', role: 'quit' }
    ])
  )
}
