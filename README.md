# whyspace-app

Whyspace keeps the decisions you make while working with Claude, with the reasons behind them, so you and Claude can come back to them later.

This repo started from the whyspace-lab test app on Nov 2 2026. Plan: https://claude.ai/artifact/XZtToutwtdwFf7HjijFAYz

## Run it

```bash
npm install
npm run dev
```

## Lab parts to replace

- `src/main/db.ts` (sql.js local file) and `server/blob-store.ts` (Vercel Blob): replaced by Supabase
- The secret MCP URL and the `x-whyspace-app-token` header: replaced by per-user sign-in
- `src/main/mcp.ts` (local MCP server) and the `mcp-remote` bridge: replaced by the hosted MCP server
- Kept: `src/main/tools.ts` (tool definitions, store interface) and `docs/what-claude-sees.md`

`docs/` still holds the lab's plan and findings.
