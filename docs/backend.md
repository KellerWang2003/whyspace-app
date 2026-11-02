# Backend: Supabase

Whyspace's data lives in the Supabase project **General playground** (ref `swovjhbaoxlxodakauxo`, us-west-2). The tables are in `public`, next to the unrelated `thread_playground_projects` table, which they don't touch.

- `supabase/migrations/`: the schema, RLS, triggers and RPCs. Both files are already applied to the project, under the same version numbers.
- `supabase/seed.sql`: demo data from the whyspace-wireframe prototype (Whiskr and AI Studio · Recall). It's safe to re-run.
- `supabase/tests/rls_check.sql`: access-rule checks. They run in one transaction and roll back.
- `src/shared/database.types.ts`: generated types for `createClient<Database>()`.

## Tables

| Area | Tables |
| --- | --- |
| People | `profiles` (one per person; `user_id` links a sign-in), `project_members` (role `owner` or `member`, title, `last_seen_at`) |
| Projects | `projects` (brief and AI summary), `parts` (Research, Brand...; lead and summary), `milestones` |
| Decisions | `decisions` (state `confirmed` / `inferred` / `open` / `changed` / `flagged`; why, snippet, tool, origin, `supersedes_id`, `superseded_at`, before and after, meeting), `decision_deciders`, `decision_evidence`, `decision_options` (options not picked), `decision_links` (led here from), `decision_reach` (the artifacts it affects, plus the update task), `decision_followers`, `decision_seen`, `decision_replies` |
| Work | `artifacts` (work vs evidence, tool, url, kind-specific `details`), `tasks` (with update-task `prompt` and `tool`), `task_subtasks`, `task_comments` |
| Meetings | `meetings`, `meeting_attendees`, `meeting_next_steps` |
| Inbox | `inbox_items` (one row per recipient; `need` is `decide` / `do` / null for FYI), `inbox_item_artifacts` |
| Activity | `activity`: what each person and their AI tool is doing now, with one row per person per project |

A few things are derived rather than stored. "Needs update" on reach means the reach has a `task_id` and that task isn't done. "Seen by" means `decision_seen.seen_at` is later than the decision's `updated_at`. A decision's current version is the one with `superseded_at` null.

## Access rules

- You see and change a project's data only if you're a member. Anonymous users see nothing.
- Only owners edit or delete a project, invite people, or change roles. Anyone can leave a project.
- Profiles: you see yourself and people you share a project with.
- Inbox: you see only items addressed to you. Members can send a person-written item (a mention) to a teammate. Whyspace's own items are written by the server with the service role.
- Replies, comments, follows, seen marks and activity are written only as yourself.
- When a decision becomes `confirmed`, `confirmed_by` and `confirmed_at` are taken from the signed-in session, and clients can't rewrite them afterwards. Server writes without a session keep the values they pass.
- Finishing a task stamps `completed_at` and clears the Inbox items that point at it.

## RPCs

- `create_project(p_name, p_brief)`: creates the project, and the caller becomes its owner.
- `invite_member(p_project, p_email, p_name?, p_title?)`: owners only. It creates a profile for an unknown email, which that person claims when they first sign in.
- `mark_project_seen(p_project)`: stamps `last_seen_at` and returns the previous value, for "since you were last here".

## Sign-in

Supabase Auth handles both methods: email (magic link or password) and Google. On sign-in, a trigger links the person to the profile invited under their email. If there is none, it creates a profile. A profile is claimed only after the email is confirmed (Google sign-ins arrive confirmed).

Dashboard setup (done by hand, since it can't be done in SQL):

1. Google Cloud console: create an OAuth client of type Web application. Set its redirect URI to `https://swovjhbaoxlxodakauxo.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Sign In / Providers → Google: turn it on, then paste the client ID and secret.
3. Supabase → Authentication → URL Configuration → Redirect URLs: add `whyspace://auth/callback` for the Electron app.

Supabase's built-in mailer sends only a few emails an hour. That's fine for testing; add custom SMTP (for example Resend) before real users.

To link your own sign-in to a demo person, sign in once and then run this in the SQL editor:

```sql
delete from profiles where user_id = (select id from auth.users where email = 'you@example.com');
update profiles set user_id = (select id from auth.users where email = 'you@example.com')
where id = md5('whyspace-seed:MC')::uuid; -- MC = Keller, CH = Christine, TR = Trevor, KL = Kelly, JK = Jordan
```

## Changing the schema

Add a new file in `supabase/migrations/` and apply it, either with the Supabase MCP `apply_migration` or `supabase db push`. Then regenerate the types:

```bash
npx supabase gen types typescript --project-id swovjhbaoxlxodakauxo --schema public > src/shared/database.types.ts
```

The remote project also holds two older migrations from the playground (`security_thread_cloud`, `username_workspaces`). `supabase db push` will warn that they're missing locally; repair them with `supabase migration repair --status reverted <version>` only if you want the CLI history clean.

## Not here yet

- AI summaries per viewer (week summary, day insights): the AI engine workstream will compute these.
- Connected tools per person: the tool connectors workstream.
- Keeping confirm human-only for the MCP server: the hosted MCP server workstream will write with its own credentials and never set `confirmed`.
