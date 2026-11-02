// Typed wrappers around ipcMain and webContents.send for the API in shared/api.ts.
import { BrowserWindow, ipcMain } from 'electron'
import type { Events, Invokes } from '../shared/api'

export function handle<K extends keyof Invokes>(
  channel: K,
  fn: (...args: Parameters<Invokes[K]>) => ReturnType<Invokes[K]> | Promise<ReturnType<Invokes[K]>>
): void {
  ipcMain.handle(channel, (_, ...args) => fn(...(args as Parameters<Invokes[K]>)))
}

// Sends to every open window, so the pill and the debug window stay in step.
export function push<K extends keyof Events>(channel: K, payload: Events[K]): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}
