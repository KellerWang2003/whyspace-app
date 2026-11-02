# whyspace-lab: decisions from Claude desktop

Oct 24, 2026. First test for the Electron lab app.

## Goal

Keller makes decisions while chatting in the Claude desktop app. They show up live in the whyspace-lab window, and Claude can read them back in a new chat. Claude can save a decision only as an AI guess. Only Keller, with a button in the app, can confirm it.

## How it fits together

```
Claude desktop ──(starts)──> mcp-remote bridge ──HTTP──> whyspace-lab (Electron)
                                                          ├─ main process
                                                          │   ├─ Whyspace MCP server  http://127.0.0.1:3917/mcp
                                                          │   └─ SQLite database      whyspace.db
                                                          └─ window: live list of decisions + Confirm button
```

- **Main process** (`src/main/`) owns the database and runs the MCP server while the app is open. When the app is closed, Claude can't reach Whyspace and says the tool failed. That's expected for a lab.
- **MCP server**: the official MCP TypeScript SDK, Streamable HTTP transport, listening on `127.0.0.1` only, so nothing outside the Mac can reach it.
- **Database**: SQLite through `sql.js`, a version of SQLite that runs without compiling anything. That avoids native build problems on a new Electron version. The file lives at `~/Library/Application Support/whyspace-lab/whyspace.db`.
- **Bridge**: Claude desktop's local servers are programs it starts itself, talking over stdin/stdout. `mcp-remote` is a small published program that Claude desktop starts and that forwards everything to our HTTP address. This is the same pattern we'd later replace with a real remote connector.
- **Window** (`src/renderer/`): a React list that refreshes the moment a decision is added or confirmed. The main process pushes a "decisions changed" message to the window over Electron IPC.

## Decision record

| Field | Meaning |
|---|---|
| `id` | Number, 1, 2, 3… |
| `part` | Which part of the project, such as "home page" or "onboarding" |
| `title` | What was decided, one sentence |
| `why` | The reason |
| `status` | `ai_guess` or `confirmed` |
| `source` | Where it came from: `claude` (via MCP) |
| `made_by` | `Claude` |
| `confirmed_by` | Who clicked Confirm (the Mac user's name), empty until then |
| `created_at`, `confirmed_at` | Times |

## What Claude gets (MCP tools)

1. **`record_decision(part, title, why)`**: saves a decision. Always saved as `ai_guess`. There is no way to pass a status.
2. **`list_decisions(part?, status?)`**: reads decisions back, newest first, optionally filtered by part or status. Each line says whether it's an AI guess or confirmed by whom.

**Confirming is not a tool.** It only exists as the Confirm button in the app window, which talks to the main process over IPC, never through MCP. So Claude can't confirm its own guess even if it tries. Test 4 checks this.

The server also sends a short instruction to Claude: record a decision when the conversation settles one, and check `list_decisions` before answering questions about past decisions.

## The four tests

| # | What Keller does | It works if |
|---|---|---|
| 1. Plumbing | In Claude desktop: "Record a decision: the home page is dark because people work late." | It appears in the app within a couple of seconds, marked AI guess |
| 2. Read back | In a new chat: "What did we decide about the home page?" | Claude calls `list_decisions` and answers from the app, without anything pasted |
| 3. Noticing on its own | Mention a decision in passing, without asking to record it | Claude records it unprompted. If it doesn't, add a project instruction in Claude ("record decisions with Whyspace when we settle something") and try again. Write down how often each works |
| 4. Confirm | Click Confirm in the app, then ask Claude again. Also ask Claude to "confirm decision 1" | Claude now says "confirmed by Keller", and has no way to confirm on its own |

Results go in `docs/findings.md`: worked, partly, or no, and why.

## Build steps

1. Add `@modelcontextprotocol/sdk`, `zod` and `sql.js` to the app.
2. `src/main/db.ts`: open or create the database, add, list and confirm decisions.
3. `src/main/mcp.ts`: the MCP server with the two tools, on port 3917.
4. `src/main/index.ts`: start both when the app starts, push changes to the window, handle the Confirm button.
5. `src/preload` and `src/renderer`: the live list with filters and the Confirm button, plus a status line showing whether the server is running.
6. Check it builds and the server answers MCP calls, before handing over.
7. Keller: `npm install`, `npm run dev`, then add Whyspace to Claude desktop's config and restart Claude desktop.

## Setup in Claude desktop (step 7, for reference)

1. Claude desktop → **Claude** menu → **Settings…** → **Developer** → **Edit Config**. This opens `claude_desktop_config.json` in Finder.
2. Put this in the file and save:

```json
{
  "mcpServers": {
    "whyspace": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:3917/mcp"]
    }
  }
}
```

3. Quit Claude desktop completely (Cmd+Q) and open it again. Whyspace should appear under the tools (the sliders icon) in the message box.

## Not in this round

Teammates and accounts, ChatGPT, the overlay beside other apps, alerts, meeting transcripts. They come after this works.

## Round 2: context and projects (Oct 24, after round 1)

**What round 1 showed.** Recording, reading back and confirming all worked. But in a brand-new chat, Claude didn't log decisions on its own: it knew nothing about the project and gave the server's instructions little weight. Decisions also had no project, so everything landed in one pile.

**Changes**

1. **Projects in the app.** Each project has a name and a short brief. A picker at the top selects the active project, and Claude's decisions go there unless it names another. Round 1 decisions are moved into a default "Whyspace" project.
2. **`get_project_context(project?)`**, a new tool whose description tells Claude to call it at the start of any chat about project work. It returns the brief, the 20 latest decisions and the logging rules. The rules travel in the tool result, which Claude weighs more than server instructions.
3. **Stronger tool descriptions.** `record_decision` now says to log the moment a decision is settled, without being asked, and defines what counts as a decision so questions and suggestions aren't logged. `list_decisions` says to check before answering from memory.
4. **Optional `project` argument** on all three tools, so a Claude Project instruction can name the Whyspace project explicitly.
5. **A `start` prompt** in Claude's + menu ("Start with Whyspace") as a one-click way to begin a chat with context loaded.
6. **Copy Claude Project instruction** button in the app's Edit brief panel, for the layered test below.

**Context lives in Whyspace, not in Claude's memory.** The brief and decisions come from the app, so any AI that connects later gets the same context.

**Retest of test 3, two ways**

| Setup | What Keller does |
|---|---|
| 3a. Tool descriptions only | A new chat outside any Claude Project, then the Chat A script |
| 3b. Plus a Claude Project instruction | A Claude Project with the copied instruction, then the Chat A script again |

For each, write down whether Claude called `get_project_context` first, how many of the four decisions it logged, and whether it logged the decoy.
