// whyspace:// links: the sign-in callback, plus links to a project or decision.
// macOS delivers them as 'open-url'; Windows and Linux start a second copy with the link in argv.
import { app } from 'electron'
import { resolve } from 'path'
import type { WhyspaceLink } from '../shared/api'

export const PROTOCOL = 'whyspace'

// Returns false when another copy of the app is already running; that copy gets the link.
export function listenForLinks(onLink: (url: string) => void): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return false
  }

  // Links can arrive before the app is ready (a click that launches it), so hold them until then.
  let ready = false
  const waiting: string[] = []
  const receive = (url: string): void => {
    if (ready) onLink(url)
    else waiting.push(url)
  }

  app.on('open-url', (event, url) => {
    event.preventDefault()
    receive(url)
  })
  app.on('second-instance', (_, argv) => {
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`))
    if (url) receive(url)
  })
  const launchUrl = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`))
  if (launchUrl) waiting.push(launchUrl)

  app.whenReady().then(() => {
    // In dev the app runs as `electron .`, so register the script path along with Electron.
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])])
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL)
    }
    ready = true
    waiting.splice(0).forEach(onLink)
  })
  return true
}

export function isAuthCallback(url: URL): boolean {
  return url.protocol === `${PROTOCOL}:` && url.host === 'auth' && url.pathname === '/callback'
}

// whyspace://project/<id> and whyspace://decision/<id>
export function parseLink(raw: string): WhyspaceLink {
  try {
    const url = new URL(raw)
    const id = url.pathname.replace(/^\/+/, '')
    if ((url.host === 'project' || url.host === 'decision') && id) {
      return { kind: url.host, id: decodeURIComponent(id), url: raw }
    }
  } catch {
    // fall through
  }
  return { kind: 'unknown', url: raw }
}
