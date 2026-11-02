-- Whyspace core schema: projects, people, parts, decisions, artifacts, tasks, meetings, inbox, activity.
-- Lives in public next to unrelated playground tables; nothing here touches them.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.member_role as enum ('owner', 'member');
create type public.decision_state as enum ('confirmed', 'inferred', 'open', 'changed', 'flagged');
-- How a decision got into Whyspace: typed by a person, logged by an AI tool, or captured in a meeting.
create type public.record_origin as enum ('person', 'ai', 'meeting');
create type public.evidence_kind as enum ('clip', 'research', 'test', 'chat', 'feedback');
create type public.artifact_kind as enum ('prototype', 'design', 'repo', 'doc', 'ai_output', 'sheet', 'video');
create type public.task_status as enum ('todo', 'in_progress', 'in_review', 'done');
create type public.task_priority as enum ('urgent', 'high', 'medium', 'low', 'none');
create type public.meeting_status as enum ('scheduled', 'live', 'ended');
create type public.inbox_kind as enum ('review', 'change', 'alert', 'invite', 'mention');
-- Needs you: decide (confirm, review, answer) or do (a task). Null means FYI.
create type public.inbox_need as enum ('decide', 'do');
create type public.activity_state as enum ('active', 'idle');

-- ---------------------------------------------------------------------------
-- People and projects
-- ---------------------------------------------------------------------------

-- A person Whyspace knows about. user_id links to a sign-in; it stays null for someone
-- invited by email who hasn't signed in yet (they claim the profile on first sign-in).
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brief text,
  -- AI summary of what the project is now, refreshed when decisions change.
  summary text,
  summary_updated_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  -- Their role on this project, e.g. "Chief marketing officer".
  title text,
  -- When they last opened the project; drives "since you were last here".
  last_seen_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);
create index project_members_profile_idx on public.project_members (profile_id);

-- A part of a project (Research, Brand, App, Marketing...). Its lead gets its updates.
create table public.parts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  lead_id uuid references public.profiles (id) on delete set null,
  position int not null default 0,
  summary text,
  summary_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, name),
  unique (project_id, id)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  due_on date,
  done_at timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index milestones_project_idx on public.milestones (project_id);

-- ---------------------------------------------------------------------------
-- Artifacts: the work itself and the evidence behind decisions
-- ---------------------------------------------------------------------------

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  part_id uuid,
  name text not null,
  kind public.artifact_kind not null,
  -- The tool it lives in: Figma, Claude Code, Perplexity, Runway...
  tool text,
  url text,
  owner_id uuid references public.profiles (id) on delete set null,
  -- Evidence backs a why (research, tests, recordings); everything else is the work.
  is_evidence boolean not null default false,
  version text,
  meta text,
  -- Kind-specific details, e.g. a repo's changed files and open PR, or a doc's outline.
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  foreign key (project_id, part_id) references public.parts (project_id, id) on delete set null (part_id)
);
create index artifacts_project_idx on public.artifacts (project_id);
create index artifacts_owner_idx on public.artifacts (owner_id);

-- ---------------------------------------------------------------------------
-- Meetings (live sessions)
-- ---------------------------------------------------------------------------

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  host_id uuid references public.profiles (id) on delete set null,
  status public.meeting_status not null default 'scheduled',
  starts_at timestamptz,
  ends_at timestamptz,
  agenda text,
  summary text,
  outcomes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id)
);
create index meetings_project_idx on public.meetings (project_id);

create table public.meeting_attendees (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (meeting_id, profile_id)
);
create index meeting_attendees_profile_idx on public.meeting_attendees (profile_id);

-- ---------------------------------------------------------------------------
-- Decisions
-- ---------------------------------------------------------------------------

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  part_id uuid,
  title text not null,
  why text,
  state public.decision_state not null default 'inferred',
  -- Who answers for it: confirms an inferred one, answers an open one.
  owner_id uuid references public.profiles (id) on delete set null,
  origin public.record_origin not null default 'ai',
  -- The tool it came from: Claude, Claude Code, Cursor, Figma, Live session...
  tool text,
  -- The words it was inferred from, quoted.
  snippet text,
  meeting_id uuid,
  -- The decision this one replaced. The replaced one gets superseded_at.
  supersedes_id uuid,
  superseded_at timestamptz,
  -- Visual changes get a before and after.
  before_text text,
  after_text text,
  -- Open questions can have a due date.
  due_on date,
  decided_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  foreign key (project_id, part_id) references public.parts (project_id, id) on delete set null (part_id),
  foreign key (project_id, meeting_id) references public.meetings (project_id, id) on delete set null (meeting_id),
  foreign key (project_id, supersedes_id) references public.decisions (project_id, id) on delete set null (supersedes_id),
  check (supersedes_id is null or supersedes_id <> id)
);
create index decisions_project_idx on public.decisions (project_id, decided_at desc);
create index decisions_owner_idx on public.decisions (owner_id);
create unique index decisions_supersedes_key on public.decisions (supersedes_id) where supersedes_id is not null;

-- Who made it ("Kelly and Trevor").
create table public.decision_deciders (
  decision_id uuid not null references public.decisions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (decision_id, profile_id)
);
create index decision_deciders_profile_idx on public.decision_deciders (profile_id);

-- What backs the why: a clip, a source, a test result.
create table public.decision_evidence (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions (id) on delete cascade,
  kind public.evidence_kind not null,
  label text not null,
  detail text,
  artifact_id uuid references public.artifacts (id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index decision_evidence_decision_idx on public.decision_evidence (decision_id);
create index decision_evidence_artifact_idx on public.decision_evidence (artifact_id);

-- Options the team weighed and didn't pick, with the reason.
create table public.decision_options (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions (id) on delete cascade,
  title text not null,
  why_not text,
  position int not null default 0
);
create index decision_options_decision_idx on public.decision_options (decision_id);

-- "Led here from": decision_id builds on led_from_id.
create table public.decision_links (
  decision_id uuid not null references public.decisions (id) on delete cascade,
  led_from_id uuid not null references public.decisions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (decision_id, led_from_id),
  check (decision_id <> led_from_id)
);
create index decision_links_from_idx on public.decision_links (led_from_id);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  part_id uuid,
  title text not null,
  description text,
  owner_id uuid references public.profiles (id) on delete set null,
  due_on date,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'none',
  decision_id uuid,
  -- Update tasks: Whyspace adds one when a decision changes something you own,
  -- with a prompt ready to paste into the tool.
  prompt text,
  tool text,
  origin public.record_origin not null default 'person',
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  foreign key (project_id, part_id) references public.parts (project_id, id) on delete set null (part_id),
  foreign key (project_id, decision_id) references public.decisions (project_id, id) on delete set null (decision_id)
);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_owner_idx on public.tasks (owner_id, status);
create index tasks_decision_idx on public.tasks (decision_id);

create table public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position int not null default 0
);
create index task_subtasks_task_idx on public.task_subtasks (task_id);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id);

-- Each person's next steps from a meeting, optionally turned into a task.
create table public.meeting_next_steps (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  body text not null,
  task_id uuid references public.tasks (id) on delete set null,
  position int not null default 0
);
create index meeting_next_steps_meeting_idx on public.meeting_next_steps (meeting_id);

-- ---------------------------------------------------------------------------
-- Reach, follows, seen, replies
-- ---------------------------------------------------------------------------

-- Where a decision reaches: the artifacts it affects. With a task, the artifact needs an
-- update until that task is done; without one, the artifact already follows the decision.
create table public.decision_reach (
  decision_id uuid not null references public.decisions (id) on delete cascade,
  artifact_id uuid not null references public.artifacts (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (decision_id, artifact_id)
);
create index decision_reach_artifact_idx on public.decision_reach (artifact_id);
create index decision_reach_task_idx on public.decision_reach (task_id);

-- Decisions someone follows without leading the part or owning the work.
create table public.decision_followers (
  decision_id uuid not null references public.decisions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (decision_id, profile_id)
);
create index decision_followers_profile_idx on public.decision_followers (profile_id);

-- Who has opened a decision, and when. "Seen by" = seen_at after the decision's updated_at.
create table public.decision_seen (
  decision_id uuid not null references public.decisions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (decision_id, profile_id)
);
create index decision_seen_profile_idx on public.decision_seen (profile_id);

create table public.decision_replies (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index decision_replies_decision_idx on public.decision_replies (decision_id);

-- ---------------------------------------------------------------------------
-- Inbox: one row per recipient
-- ---------------------------------------------------------------------------

create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind public.inbox_kind not null,
  need public.inbox_need,
  -- The person it's about or from.
  from_id uuid references public.profiles (id) on delete set null,
  -- Who wrote it: Whyspace AI or a person.
  author_is_ai boolean not null default true,
  -- Where it came from, e.g. "Trevor's brand guidelines update".
  source text,
  summary text not null,
  body text,
  -- Which of your things it touches, e.g. "Your poster campaign".
  touches text,
  decision_id uuid references public.decisions (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  meeting_id uuid references public.meetings (id) on delete set null,
  read_at timestamptz,
  done_at timestamptz,
  -- Remind me when I open the artifact.
  remind_on_open boolean not null default false,
  created_at timestamptz not null default now()
);
create index inbox_items_recipient_idx on public.inbox_items (recipient_id, created_at desc);
create index inbox_items_project_idx on public.inbox_items (project_id);
create index inbox_items_decision_idx on public.inbox_items (decision_id);
create index inbox_items_task_idx on public.inbox_items (task_id);
create index inbox_items_meeting_idx on public.inbox_items (meeting_id);
create index inbox_items_from_idx on public.inbox_items (from_id);

create table public.inbox_item_artifacts (
  inbox_item_id uuid not null references public.inbox_items (id) on delete cascade,
  artifact_id uuid not null references public.artifacts (id) on delete cascade,
  context text,
  excerpt text,
  position int not null default 0,
  primary key (inbox_item_id, artifact_id)
);
create index inbox_item_artifacts_artifact_idx on public.inbox_item_artifacts (artifact_id);

-- ---------------------------------------------------------------------------
-- Activity: what each person, and their AI tool, is working on right now.
-- High level only, never prompts. One row per person per project.
-- ---------------------------------------------------------------------------

create table public.activity (
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  part_id uuid,
  artifact_id uuid,
  tool text,
  doing text not null,
  ai_doing text,
  state public.activity_state not null default 'active',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, profile_id),
  foreign key (project_id, part_id) references public.parts (project_id, id) on delete set null (part_id),
  foreign key (project_id, artifact_id) references public.artifacts (project_id, id) on delete set null (artifact_id)
);
create index activity_profile_idx on public.activity (profile_id);

-- Indexes for the remaining foreign keys.
create index projects_created_by_idx on public.projects (created_by);
create index parts_lead_idx on public.parts (lead_id);
create index artifacts_part_idx on public.artifacts (project_id, part_id);
create index meetings_host_idx on public.meetings (host_id);
create index decisions_part_idx on public.decisions (project_id, part_id);
create index decisions_meeting_idx on public.decisions (project_id, meeting_id);
create index decisions_supersedes_idx on public.decisions (project_id, supersedes_id);
create index decisions_confirmed_by_idx on public.decisions (confirmed_by);
create index decisions_created_by_idx on public.decisions (created_by);
create index tasks_part_idx on public.tasks (project_id, part_id);
create index tasks_project_decision_idx on public.tasks (project_id, decision_id);
create index tasks_created_by_idx on public.tasks (created_by);
create index task_comments_author_idx on public.task_comments (author_id);
create index meeting_next_steps_profile_idx on public.meeting_next_steps (profile_id);
create index meeting_next_steps_task_idx on public.meeting_next_steps (task_id);
create index decision_replies_author_idx on public.decision_replies (author_id);
create index activity_part_idx on public.activity (project_id, part_id);
create index activity_artifact_idx on public.activity (project_id, artifact_id);
