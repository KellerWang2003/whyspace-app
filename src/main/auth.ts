// Sign-in and the Supabase session. The session lives here in the main process, never in a window,
// so every window shares one sign-in and the tokens stay out of the renderer.
import { app, powerMonitor, safeStorage, shell } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { AuthState } from '../shared/api'

const SUPABASE_URL = import.meta.env.MAIN_VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.MAIN_VITE_SUPABASE_PUBLISHABLE_KEY

// Must be in Supabase's allowed redirect URLs (Authentication > URL configuration).
export const AUTH_CALLBACK = 'whyspace://auth/callback'

// supabase-js keeps the session and the sign-in verifier here: one file in userData,
// encrypted with the macOS Keychain (or the OS equivalent) when it's available.
class SessionFile {
  private path = join(app.getPath('userData'), 'session.bin')
  private items: Record<string, string> = this.read()

  private read(): Record<string, string> {
    if (!existsSync(this.path)) return {}
    try {
      const raw = readFileSync(this.path)
      const text = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString('utf8')
      return JSON.parse(text)
    } catch (err) {
      console.error('[whyspace auth] could not read the saved session, signing out', err)
      return {}
    }
  }

  private write(): void {
    if (Object.keys(this.items).length === 0) {
      if (existsSync(this.path)) unlinkSync(this.path)
      return
    }
    const text = JSON.stringify(this.items)
    writeFileSync(
      this.path,
      safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : text
    )
  }

  getItem(key: string): string | null {
    return this.items[key] ?? null
  }

  setItem(key: string, value: string): void {
    this.items[key] = value
    this.write()
  }

  removeItem(key: string): void {
    delete this.items[key]
    this.write()
  }
}

let client: SupabaseClient | undefined
let state: AuthState = { status: 'loading' }
let notify: (state: AuthState, session: Session | null) => void = () => {}

export function supabase(): SupabaseClient | undefined {
  return client
}

export function authState(): AuthState {
  return state
}

function setState(next: AuthState, session: Session | null = null): void {
  state = next
  notify(state, session)
}

function signedOut(error?: string, emailSentTo?: string): void {
  setState({ status: 'signed_out', error, emailSentTo })
}

// Call once after app ready. `onChange` runs on every sign-in, sign-out and token refresh.
export function startAuth(onChange: (state: AuthState, session: Session | null) => void): void {
  notify = onChange
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    signedOut('Add MAIN_VITE_SUPABASE_URL and MAIN_VITE_SUPABASE_PUBLISHABLE_KEY to .env.local')
    return
  }
  client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      flowType: 'pkce',
      storage: new SessionFile(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  })
  client.auth.onAuthStateChange((_event, session) => {
    if (session) {
      const meta = session.user.user_metadata ?? {}
      setState(
        {
          status: 'signed_in',
          user: {
            id: session.user.id,
            email: session.user.email,
            name: (meta.full_name ?? meta.name) as string | undefined
          }
        },
        session
      )
    } else if (state.status !== 'signed_out') {
      signedOut()
    }
  })
  // A sleeping Mac misses refreshes, so check the session as soon as it wakes.
  powerMonitor.on('resume', () => {
    client?.auth.startAutoRefresh()
    client?.auth.getSession()
  })
}

async function run(
  action: (db: SupabaseClient) => Promise<{ error: Error | null }>
): Promise<boolean> {
  if (!client) return false
  const { error } = await action(client)
  if (error) signedOut(error.message)
  return !error
}

export async function sendEmailLink(email: string): Promise<void> {
  const sent = await run((db) =>
    db.auth.signInWithOtp({ email, options: { emailRedirectTo: AUTH_CALLBACK } })
  )
  if (sent) signedOut(undefined, email)
}

// The same email carries a 6 digit code when the Supabase template includes {{ .Token }}.
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  await run((db) => db.auth.verifyOtp({ email, token: code.trim(), type: 'email' }))
}

// Opens Google in the default browser. It comes back through whyspace://auth/callback.
export async function signInWithGoogle(): Promise<void> {
  await run(async (db) => {
    const { data, error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: AUTH_CALLBACK, skipBrowserRedirect: true }
    })
    if (data?.url) await shell.openExternal(data.url)
    return { error }
  })
}

// Handles whyspace://auth/callback?code=… from the email link or Google.
export async function finishSignIn(url: URL): Promise<void> {
  const params = new URLSearchParams(url.search || url.hash.slice(1))
  const failure = params.get('error_description') ?? params.get('error')
  if (failure) return signedOut(failure)
  const code = params.get('code')
  if (!code) return signedOut('The sign-in link was missing its code. Try again.')
  await run((db) => db.auth.exchangeCodeForSession(code))
}

export async function signOut(): Promise<void> {
  await run((db) => db.auth.signOut())
}
