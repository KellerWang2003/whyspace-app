/// <reference types="electron-vite/node" />

// Set in .env.local.
interface ImportMetaEnv {
  // Supabase project and its publishable key (safe to ship in the app).
  readonly MAIN_VITE_SUPABASE_URL?: string
  readonly MAIN_VITE_SUPABASE_PUBLISHABLE_KEY?: string
  // Lab: the hosted lab server.
  readonly MAIN_VITE_WHYSPACE_URL?: string
  readonly MAIN_VITE_WHYSPACE_APP_TOKEN?: string
  readonly MAIN_VITE_WHYSPACE_MCP_URL?: string
}
