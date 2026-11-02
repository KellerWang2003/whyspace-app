# whyspace-app

Whyspace keeps the decisions you make while working with Claude, with the reasons behind them, so you and Claude can come back to them later.

This repo started from the whyspace-lab test app on Nov 2 2026. Plan: https://claude.ai/artifact/XZtToutwtdwFf7HjijFAYz

## Run it

```bash
cp .env.example .env.local   # then fill in the Supabase URL and publishable key
npm install
npm run dev
```

The app lives in the menu bar (tray) and opens a plain debug window: sign in, sync status, and the raw rows you can see.

## Sign-in and sync

- The Supabase session lives in the main process (`src/main/auth.ts`), saved in userData and encrypted with the Keychain. Windows never hold tokens.
- Windows talk to main through one typed API, `window.whyspace` (`src/shared/api.ts`): `invoke` for calls, `on` for pushes. Every window gets the same pushes.
- `src/main/sync.ts` loads the tables in `src/shared/tables.ts` and keeps them live with Supabase Realtime.
- Sign-in links come back as `whyspace://auth/callback`, which must be listed under Authentication > URL configuration > Redirect URLs in Supabase. Tables only stream live once they're in the `supabase_realtime` publication.
- `whyspace://project/<id>` and `whyspace://decision/<id>` open the app and are passed to the window as `link:opened`.

## What changed from the lab

- Gone from the app: the lab decisions window, its local sql.js store (with the sample "Tidewater Coffee" project), the local MCP server on port 3917, and the secret-URL client. The app reads Supabase as the signed-in user and starts empty.
- Still here for the hosted MCP server (workstream 3) to port: `src/main/tools.ts` (tool definitions, store interface), `src/shared/decisions.ts`, `server/` and `docs/what-claude-sees.md`.

`docs/` still holds the lab's plan and findings.
