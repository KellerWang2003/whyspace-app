// Wires sign-in, sync, links, the tray and the debug window together.
import { handle, push } from './ipc'
import {
  authState,
  finishSignIn,
  sendSignInEmail,
  signOut,
  startAuth,
  supabase,
  verifyEmailCode
} from './auth'
import { onSyncStatus, reloadAll, startSync, stopSync, syncSnapshot, syncStatus } from './sync'
import { isAuthCallback, parseLink } from './links'
import { createTray, updateTray } from './tray'
import { openDebugWindow } from './debug-window'

// Handles every whyspace:// link that listenForLinks hands over.
export function openLink(raw: string): void {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return
  }
  if (isAuthCallback(url)) {
    finishSignIn(url)
    openDebugWindow()
    return
  }
  const link = parseLink(raw)
  const win = openDebugWindow()
  // A window that's still loading would miss the push, so wait for it.
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => push('link:opened', link))
  } else {
    push('link:opened', link)
  }
}

// Call once after app ready.
export function startShell(): void {
  const actions = {
    openDebug: () => void openDebugWindow(),
    signOut: () => void signOut()
  }
  const refreshTray = (): void => updateTray(authState(), syncStatus(), actions)

  handle('auth:state', authState)
  handle('auth:send-email', sendSignInEmail)
  handle('auth:verify-code', verifyEmailCode)
  handle('auth:sign-out', signOut)
  handle('sync:snapshot', syncSnapshot)
  handle('sync:status', syncStatus)
  handle('sync:reload', reloadAll)

  createTray(actions)
  onSyncStatus(refreshTray)
  startAuth((state) => {
    push('auth:changed', state)
    const db = supabase()
    // Deferred so Supabase calls don't run inside its own auth callback.
    setTimeout(() => {
      if (state.status === 'signed_in' && db) startSync(db)
      else if (state.status === 'signed_out') stopSync()
      refreshTray()
    })
  })
  openDebugWindow()
}
