// Sign-in and the Supabase session. The session lives here in the main process, never in a window,
// so every window shares one sign-in and the tokens stay out of the renderer.
import { app, powerMonitor, safeStorage } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  createClient,
  type AuthError,
  type Session,
  type SupabaseClient
} from '@supabase/supabase-js'
import type { AuthState } from '../shared/api'
import type { Database } from '../shared/database.types'

const SUPABASE_URL = import.meta.env.MAIN_VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.MAIN_VITE_SUPABASE_PUBLISHABLE_KEY

// Sign-in is by email only for now: the email carries a code to type into the app. Its link
// also works once this URL is in Supabase's allowed redirect URLs (Authentication > URL
// configuration); until then the link lands on the Site URL and uses up the code.
export const AUTH_CALLBACK = 'whyspace://auth/callback'

// Supabase's built-in mailer is for testing: a few emails an hour, and only to people on
// the Supabase team. Say so plainly instead of showing the raw error.
const AUTH_ERRORS: Record<string, string> = {
  over_email_send_rate_limit:
    'Supabase only sends a few sign-in emails an hour. Wait a while, or use the code you already have.',
  email_address_not_authorized:
    "Supabase's test mailer only sends to people on the Supabase team. Use an address on the team.",
  otp_expired: 'That code has expired or was already used. Send a new one.'
}

function describe(error: AuthError): string {
  const known = error.code ? AUTH_ERRORS[error.code] : undefined
  return known ? `${known} (${error.code})` : error.message
}

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

let client: SupabaseClient<Database> | undefined
let state: AuthState = { status: 'loading' }
let notify: (state: AuthState, session: Session | null) => void = () => {}

export function supabase(): SupabaseClient<Database> | undefined {
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
  client = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
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

// Runs a Supabase auth call. On failure it shows the error and keeps the code field open
// for `emailSentTo`, so a typo doesn't mean sending another email.
async function run(
  action: (db: SupabaseClient<Database>) => Promise<{ error: AuthError | null }>,
  emailSentTo?: string
): Promise<boolean> {
  if (!client) return false
  const { error } = await action(client)
  if (error) signedOut(describe(error), emailSentTo)
  return !error
}

function pendingEmail(): string | undefined {
  return state.status === 'signed_out' ? state.emailSentTo : undefined
}

// The first email to a new address also creates the account.
export async function sendSignInEmail(email: string): Promise<void> {
  const sent = await run(
    (db) => db.auth.signInWithOtp({ email, options: { emailRedirectTo: AUTH_CALLBACK } }),
    pendingEmail()
  )
  if (sent) signedOut(undefined, email)
}

export async function verifyEmailCode(code: string): Promise<void> {
  const email = pendingEmail()
  if (!email) return signedOut('Send yourself a code first.')
  await run((db) => db.auth.verifyOtp({ email, token: code.trim(), type: 'email' }), email)
}

// Handles whyspace://auth/callback?code=… from the email link.
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
