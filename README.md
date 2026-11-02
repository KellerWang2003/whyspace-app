# whyspace-app

Whyspace keeps the decisions you make while working with Claude, with the reasons behind them, so you and Claude can come back to them later.

This repo started from the whyspace-lab test app on Nov 2 2026. Plan: https://claude.ai/artifact/XZtToutwtdwFf7HjijFAYz

## Run it

```bash
cp .env.example .env.local   # then fill in the Supabase URL and publishable key
npm install
npm run dev
```

The app lives in the menu bar (tray). No window opens on its own: pick "Sign in…" or "Open debug window" from the menu-bar icon (or click the Dock icon) for a plain debug window with sign-in, sync status, and the raw rows you can see.

On macOS, `npm run dev` runs a renamed copy of Electron (`node_modules/.dev-app/`, an APFS clone) so the Dock and menu bar say Whyspace instead of Electron.

Only one copy runs at a time. To run a second checkout beside it, give it its own profile: `WHYSPACE_PROFILE=pill npm run dev` (it gets its own userData and sign-in).

## Sign-in and sync

- The Supabase session lives in the main process (`src/main/auth.ts`), saved in userData and encrypted with the Keychain. Windows never hold tokens.
- Windows talk to main through one typed API, `window.whyspace` (`src/shared/api.ts`): `invoke` for calls, `on` for pushes. Every window gets the same pushes.
- `src/main/sync.ts` loads the tables in `src/shared/tables.ts` and keeps them live with Supabase Realtime.
- Sign-in is by email only for now (no Google): the app emails a code and you type it in. That needs `{{ .Token }}` in Supabase's Confirm signup and Magic link email templates. The email's link also works if `whyspace://auth/callback` is added under Authentication > URL configuration > Redirect URLs; until then, use the code. Supabase's built-in mailer only sends a few emails an hour, and only to people on the Supabase team.
- Tables only stream live once they're in the `supabase_realtime` publication.
- `whyspace://project/<id>` and `whyspace://decision/<id>` open the app and are passed to the window as `link:opened`.

## What changed from the lab

- Supabase replaces the lab's sql.js file and Vercel Blob store: schema, access rules and types are in `supabase/` and `src/shared/database.types.ts` (see `docs/backend.md`).
- Gone from the app: the lab decisions window, its local store (with the sample "Tidewater Coffee" project), the local MCP server on port 3917, and the secret-URL client. The app reads Supabase as the signed-in user and starts empty.
- Per-user sign-in replaces the secret MCP URL and the `x-whyspace-app-token` header.
- Still here for the hosted MCP server (workstream 3) to port: `src/main/tools.ts` (tool definitions, store interface), `src/shared/decisions.ts`, `server/` and `docs/what-claude-sees.md`.

`docs/` still holds the lab's plan and findings.
