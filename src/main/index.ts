import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createPill } from './pill'
import { listenForLinks } from './links'
import { openLink, startShell } from './shell'
import { openDebugWindow } from './debug-window'

// Dev: WHYSPACE_PROFILE=<name> gives this copy its own userData (and sign-in), so a second
// checkout can run beside it instead of being stopped by the single-instance lock.
if (process.env['WHYSPACE_PROFILE']) {
  app.setPath('userData', `${app.getPath('userData')}-${process.env['WHYSPACE_PROFILE']}`)
}

// Only one copy runs; a second launch (or a whyspace:// link) is handed to it.
const isPrimary = listenForLinks(openLink)

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (!isPrimary) return

  // Set app user model id for windows
  electronApp.setAppUserModelId('app.whyspace.desktop')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Sign-in, sync and the menu-bar icon. No window opens on its own.
  startShell()
  createPill()

  // Clicking the Dock icon opens the debug window, in case the menu-bar icon is hidden.
  app.on('activate', () => openDebugWindow())
})

// The tray keeps Whyspace running with every window closed; quit from the tray menu.
app.on('window-all-closed', () => {})
