import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { listenForLinks } from './links'
import { openLink, startShell } from './shell'
import { openDebugWindow } from './debug-window'

// Only one copy runs; a second launch (or a whyspace:// link) is handed to it.
const isPrimary = listenForLinks(openLink)

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (!isPrimary) return

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Sign-in, sync, tray and the debug window.
  startShell()

  // Clicking the dock icon brings back the debug window.
  app.on('activate', () => openDebugWindow())
})

// The tray keeps Whyspace running with every window closed; quit from the tray menu.
app.on('window-all-closed', () => {})
