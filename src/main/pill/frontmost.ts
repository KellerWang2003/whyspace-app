import { app, shell, systemPreferences } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { basename } from 'path'
import { createInterface } from 'readline'
import type { FrontContext } from '../../shared/pill'

// Watches which app is in front and which file its focused window has open.
//
// One long-running osascript (JavaScript for Automation) does the watching, so there is
// no native module to build. The app's name needs no permission. The window's document
// and title come from the Accessibility API, which macOS only allows once the person
// turns on Whyspace under Privacy & Security > Accessibility. osascript inherits that
// grant from this app (in development the app is listed as "Electron").
//
// It prints one JSON line whenever something changes, skips this app itself so clicking
// the pill doesn't replace what you're working in, and exits after about 30 minutes so
// small leaks in the bridge never pile up; it is restarted right away.
const WATCHER = `
ObjC.import('AppKit')
ObjC.import('ApplicationServices')
// Typed as plain objects, so an element from one call can be passed to the next.
ObjC.bindFunction('AXUIElementCreateApplication', ['id', ['int']])
ObjC.bindFunction('AXUIElementCopyAttributeValue', ['int', ['id', 'id', 'id*']])
ObjC.bindFunction('AXUIElementSetMessagingTimeout', ['int', ['id', 'float']])
function run(argv) {
  const ownPid = Number(argv[0])
  const out = $.NSFileHandle.fileHandleWithStandardOutput
  const write = (s) => out.writeData($(s + '\\n').dataUsingEncoding($.NSUTF8StringEncoding))
  const copy = (el, name) => {
    const ref = Ref()
    return $.AXUIElementCopyAttributeValue(el, name, ref) === 0 ? ref[0] : null
  }
  const text = (el, name) => {
    const s = ObjC.unwrap(copy(el, name))
    return typeof s === 'string' && s ? s : null
  }
  let last = ''
  for (let i = 0; i < 3600; i++) {
    // Spinning the run loop keeps frontmostApplication up to date.
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.5))
    const front = $.NSWorkspace.sharedWorkspace.frontmostApplication
    if (!front || front.processIdentifier === ownPid) continue
    const info = {
      name: ObjC.unwrap(front.localizedName) || null,
      bundleId: ObjC.unwrap(front.bundleIdentifier) || null,
      bundlePath: ObjC.unwrap(front.bundleURL.path) || null,
      title: null,
      document: null
    }
    const ax = $.AXUIElementCreateApplication(front.processIdentifier)
    $.AXUIElementSetMessagingTimeout(ax, 0.5)
    const win = copy(ax, 'AXFocusedWindow')
    if (win) {
      info.title = text(win, 'AXTitle')
      info.document = text(win, 'AXDocument')
    }
    const line = JSON.stringify(info)
    if (line !== last) { write(line); last = line }
  }
}
`

interface Raw {
  name: string | null
  bundleId: string | null
  bundlePath: string | null
  title: string | null
  document: string | null
}

export const hasAccess = (): boolean => systemPreferences.isTrustedAccessibilityClient(false)

// Shows the system prompt (once per app) and opens the Accessibility settings.
export function requestAccess(): void {
  systemPreferences.isTrustedAccessibilityClient(true)
  shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
  )
}

// The file's name: from the document's path when the app reports one, otherwise from
// the window title with the app's name taken off ("promo-video – Figma" → "promo-video").
function fileOf(raw: Raw): FrontContext['file'] {
  if (raw.document) {
    try {
      const path = raw.document.startsWith('file://')
        ? decodeURIComponent(new URL(raw.document).pathname)
        : raw.document
      return { name: basename(path), path }
    } catch {
      // Not a path we can read: use the title instead.
    }
  }
  const title = raw.title?.trim()
  if (!title || title === raw.name) return undefined
  const suffix = new RegExp(`\\s+[—–-]\\s+${escapeRegExp(raw.name ?? '')}$`)
  const name = raw.name ? title.replace(suffix, '') : title
  return name ? { name } : undefined
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Keep the size at 'normal': 'large' crashes Electron 44 on macOS 27 (SIGTRAP in getFileIcon).
const icons = new Map<string, Promise<string | undefined>>()
function iconOf(bundlePath: string | null): Promise<string | undefined> {
  if (!bundlePath) return Promise.resolve(undefined)
  if (!icons.has(bundlePath)) {
    icons.set(
      bundlePath,
      app
        .getFileIcon(bundlePath, { size: 'normal' })
        .then((img) => img.toDataURL())
        .catch(() => undefined)
    )
  }
  return icons.get(bundlePath)!
}

// Calls back with the latest context whenever the app, file or access changes.
export function watchFrontmost(onChange: (context: FrontContext) => void): () => void {
  let child: ChildProcess | undefined
  let stopped = false
  let lastRaw: Raw | undefined
  let access = hasAccess()

  const emit = async (raw: Raw): Promise<void> => {
    const context: FrontContext = {
      app: { name: raw.name ?? 'Unknown app', bundleId: raw.bundleId ?? undefined },
      file: access ? fileOf(raw) : undefined,
      access: access ? 'granted' : 'needed'
    }
    context.app.icon = await iconOf(raw.bundlePath)
    if (raw === lastRaw) onChange(context)
  }

  const start = (): void => {
    if (stopped || process.platform !== 'darwin') return
    child = spawn('osascript', ['-l', 'JavaScript', '-e', WATCHER, String(process.pid)])
    createInterface({ input: child.stdout! }).on('line', (line) => {
      try {
        lastRaw = JSON.parse(line) as Raw
        emit(lastRaw)
      } catch {
        // Not one of our lines.
      }
    })
    child.stderr!.on('data', (d) => console.error('[whyspace pill] watcher:', String(d).trim()))
    child.on('exit', () => {
      child = undefined
      setTimeout(start, 1000)
    })
  }

  // The grant can change at any time in System Settings. Restart the watcher when it does,
  // so the new process reads windows with the new permission.
  const accessTimer = setInterval(() => {
    const now = hasAccess()
    if (now === access) return
    access = now
    if (lastRaw) emit(lastRaw)
    child?.kill()
  }, 2000)

  start()
  return () => {
    stopped = true
    clearInterval(accessTimer)
    child?.kill()
  }
}
