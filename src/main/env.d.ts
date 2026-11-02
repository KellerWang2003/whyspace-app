/// <reference types="electron-vite/node" />

// Set in .env.local to use the hosted server instead of the local one.
interface ImportMetaEnv {
  readonly MAIN_VITE_WHYSPACE_URL?: string
  readonly MAIN_VITE_WHYSPACE_APP_TOKEN?: string
  readonly MAIN_VITE_WHYSPACE_MCP_URL?: string
}
