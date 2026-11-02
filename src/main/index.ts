import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { userInfo } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { DecisionStore } from './db'
import { MCP_URL, startMcpServer } from './mcp'
import { RemoteStore } from './remote'
import type { Decision, DecisionFilter, Project, ServerStatus } from '../shared/decisions'

// The person clicking Confirm in this window. Lab shortcut: the Mac account name.
const confirmer = (() => {
  const name = userInfo().username
  return name.charAt(0).toUpperCase() + name.slice(1)
})()

function broadcast(channel: string): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel)
}

// Everything the window needs, whether the data is local or on the hosted server.
interface AppStore {
  list(filter: DecisionFilter): Decision[] | Promise<Decision[]>
  confirm(id: number, by: string): unknown
  projectsWithActive():
    { projects: Project[]; activeId?: number } | Promise<{ projects: Project[]; activeId?: number }>
  createProject(name: string, brief: string): Project | Promise<Project>
  updateProject(id: number, fields: { name?: string; brief?: string }): unknown
  setActiveProject(id: number): void | Promise<void>
}

// Hosted mode when .env.local names a server, local mode otherwise.
const HOSTED_URL = import.meta.env.MAIN_VITE_WHYSPACE_URL
const APP_TOKEN = import.meta.env.MAIN_VITE_WHYSPACE_APP_TOKEN
const HOSTED_MCP_URL = import.meta.env.MAIN_VITE_WHYSPACE_MCP_URL

async function startLocal(status: ServerStatus): Promise<AppStore> {
  const store = await DecisionStore.open(status.dbPath)
  try {
    await startMcpServer(store, () => broadcast('data:changed'))
    status.running = true
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    status.error =
      code === 'EADDRINUSE'
        ? 'Port 3917 is already in use. Is another copy of whyspace-lab open?'
        : String(err)
    console.error('[whyspace mcp]', err)
  }
  return Object.assign(store, {
    projectsWithActive: () => ({ projects: store.projects(), activeId: store.activeProject()?.id })
  })
}

// The hosted server can't tell the window when Claude records something, so check every 2 seconds.
function watchRemote(store: RemoteStore, status: ServerStatus): void {
  let last = ''
  const check = async (): Promise<void> => {
    try {
      const snapshot = JSON.stringify([await store.list(), await store.projectsWithActive()])
      status.running = true
      status.error = undefined
      if (last && snapshot !== last) broadcast('data:changed')
      last = snapshot
    } catch (err) {
      status.running = false
      status.error = String(err)
    }
  }
  check()
  setInterval(check, 2000)
}

async function startWhyspace(): Promise<void> {
  let store: AppStore
  let status: ServerStatus
  if (HOSTED_URL && APP_TOKEN) {
    status = {
      mode: 'hosted',
      running: false,
      url: HOSTED_MCP_URL ?? HOSTED_URL,
      dbPath: 'Vercel Blob'
    }
    const remote = new RemoteStore(HOSTED_URL, APP_TOKEN)
    watchRemote(remote, status)
    store = remote
  } else {
    status = {
      mode: 'local',
      running: false,
      url: MCP_URL,
      dbPath: join(app.getPath('userData'), 'whyspace.db')
    }
    store = await startLocal(status)
  }

  ipcMain.handle('decisions:list', (_, filter: DecisionFilter) => store.list(filter))
  // Confirming only happens here, from a click in the window, never over MCP.
  ipcMain.handle('decisions:confirm', async (_, id: number) => {
    const d = await store.confirm(id, confirmer)
    broadcast('data:changed')
    return d
  })

  ipcMain.handle('projects:list', () => store.projectsWithActive())
  ipcMain.handle('projects:create', async (_, name: string, brief: string) => {
    const p = await store.createProject(name, brief)
    await store.setActiveProject(p.id)
    broadcast('data:changed')
    return p
  })
  ipcMain.handle(
    'projects:update',
    async (_, id: number, fields: { name?: string; brief?: string }) => {
      const p = await store.updateProject(id, fields)
      broadcast('data:changed')
      return p
    }
  )
  ipcMain.handle('projects:select', async (_, id: number) => {
    await store.setActiveProject(id)
    broadcast('data:changed')
  })
  ipcMain.handle('server:status', () => status)
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    title: 'whyspace-lab',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await startWhyspace()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
