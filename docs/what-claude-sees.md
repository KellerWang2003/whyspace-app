# What Whyspace tells Claude

This is the exact text Claude receives from the Whyspace server, copied from `src/main/mcp.ts`. If you change the wording there, it changes what Claude reads after you restart the app and Claude.

## 1. Tool descriptions (Claude always sees these)

Claude reads every tool's name and description in every chat. This is the most reliable way to steer it.

**`get_project_context`**, shown as "Load project context"
> Call this first, at the start of every conversation about the user's project, design or product work, before answering. Returns the project brief, recent decisions and how to log new ones. Also call it when the user switches to another project.

**`record_decision`**, shown as "Record a decision"
> Save a decision to the project's Whyspace log the moment the user settles it, without being asked. Use it whenever the user commits to a choice about what to build, how it looks or works, or what to drop. Saved as an AI guess until a person confirms it in the Whyspace app.

The fields Claude fills in:
- `part`: Which part of the project, e.g. "home page", "onboarding", "brand"
- `title`: What was decided, in one sentence
- `why`: The reason, in the user's words where possible
- `project` (optional): Whyspace project name. Leave empty to use the project selected in the Whyspace app, unless the user or your project instructions name one.

**`list_decisions`**, shown as "List decisions"
> Read the project's decision log, newest first. Call it before answering any question about what was decided, instead of relying on memory. Each decision shows whether it is an AI guess or confirmed, and by whom.

Optional filters: `part`, `status` (AI guesses or confirmed only), `project`.

## 2. The rules (returned when Claude loads the project context)

When Claude calls "Load project context", it gets the project name, the brief, up to 20 recent decisions, and then these rules:

> How to work with Whyspace:
> - Whyspace is this project's decision log: what was decided, and why.
> - Whenever the user settles a decision (a choice about what to build, how it looks, how it works, or what to drop), call record_decision right away. Do not wait to be asked, and do not ask permission first. Then tell the user in one short line that you saved it as an AI guess.
> - A decision is a choice the user commits to ("let's do X", "we're going with X", "X, because Y"). Questions, options you are still weighing, and your own suggestions the user hasn't accepted are not decisions.
> - If a new decision replaces an earlier one, record the new one and mention the earlier decision's number in the why.
> - Before answering anything about what was decided before, call list_decisions instead of guessing or relying on memory.
> - You cannot confirm decisions. Only a person can, with the Confirm button in the Whyspace app.

## 3. Server instructions (sent once when Claude connects)

The same rules, with this line in front. In round 1 this was the only place the rules lived, and Claude mostly ignored it.

> Call get_project_context at the start of any conversation about the user's project, design or product work, before your first answer.

## 4. The Claude Project instruction (only if you paste it)

This is what the app's "Copy Claude Project instruction" button copies, with your project's name filled in:

> This chat is part of the Whyspace project "Whyspace". At the start of every chat, call the Whyspace get_project_context tool. Whenever we settle a decision, record it with Whyspace's record_decision without being asked, and check list_decisions before answering questions about past decisions.

## What Claude sees when it saves a decision

> Saved to Whyspace as an AI guess:
> #2 [navigation] Use a sidebar for navigation
>   Why: The canvas needs the width
>   Status: AI guess, not confirmed yet · recorded by Claude on 2026-10-24
