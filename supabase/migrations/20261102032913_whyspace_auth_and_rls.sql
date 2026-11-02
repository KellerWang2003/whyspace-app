-- Sign-in, helpers, triggers and row-level security.
-- Rule: you see and change a project's data only if you're a member of that project.

-- ---------------------------------------------------------------------------
-- Private helpers (not exposed through the API)
-- ---------------------------------------------------------------------------

create schema if not exists whyspace_private;
revoke all on schema whyspace_private from public;
grant usage on schema whyspace_private to authenticated, service_role;

-- The signed-in person's profile id.
create function whyspace_private.my_profile_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.profiles where user_id = (select auth.uid())
$$;

create function whyspace_private.is_member(p_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.project_members m
    join public.profiles p on p.id = m.profile_id
    where m.project_id = p_project and p.user_id = (select auth.uid())
  )
$$;

create function whyspace_private.is_owner(p_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.project_members m
    join public.profiles p on p.id = m.profile_id
    where m.project_id = p_project and m.role = 'owner' and p.user_id = (select auth.uid())
  )
$$;

-- True when the given profile is me or shares a project with me.
create function whyspace_private.can_see_profile(p_profile uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles me
    where me.user_id = (select auth.uid())
      and (me.id = p_profile or exists (
        select 1 from public.project_members a
        join public.project_members b on b.project_id = a.project_id
        where a.profile_id = me.id and b.profile_id = p_profile
      ))
  )
$$;

-- Project of a parent row, for child-table policies.
create function whyspace_private.decision_project(p_decision uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select project_id from public.decisions where id = p_decision $$;

create function whyspace_private.task_project(p_task uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select project_id from public.tasks where id = p_task $$;

create function whyspace_private.meeting_project(p_meeting uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select project_id from public.meetings where id = p_meeting $$;

-- Who sent an Inbox item (the sender can't read the recipient's row).
create function whyspace_private.inbox_sender(p_item uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select from_id from public.inbox_items where id = p_item and author_is_ai = false $$;

grant execute on all functions in schema whyspace_private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function whyspace_private.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger set_updated_at before update on public.profiles for each row execute function whyspace_private.set_updated_at();
create trigger set_updated_at before update on public.projects for each row execute function whyspace_private.set_updated_at();
create trigger set_updated_at before update on public.artifacts for each row execute function whyspace_private.set_updated_at();
create trigger set_updated_at before update on public.meetings for each row execute function whyspace_private.set_updated_at();
create trigger set_updated_at before update on public.decisions for each row execute function whyspace_private.set_updated_at();
create trigger set_updated_at before update on public.tasks for each row execute function whyspace_private.set_updated_at();
create trigger set_updated_at before update on public.activity for each row execute function whyspace_private.set_updated_at();

-- Confirming records who confirmed and when, from the session, so it can't be spoofed.
-- Server writes (service role, no session) keep the values they pass.
create function whyspace_private.stamp_decision()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := whyspace_private.my_profile_id();
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(me, new.created_by);
    new.decided_at := coalesce(new.decided_at, now());
  elsif me is not null then
    new.created_by := old.created_by;
    new.confirmed_by := old.confirmed_by;
    new.confirmed_at := old.confirmed_at;
  end if;
  if new.state = 'confirmed' and (tg_op = 'INSERT' or old.state is distinct from 'confirmed') then
    new.confirmed_by := coalesce(me, new.confirmed_by);
    new.confirmed_at := case when me is null then coalesce(new.confirmed_at, now()) else now() end;
  end if;
  return new;
end
$$;
create trigger stamp_decision before insert or update on public.decisions
  for each row execute function whyspace_private.stamp_decision();

-- When a decision replaces another, mark the old one superseded.
create function whyspace_private.mark_superseded()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.supersedes_id is not null and (tg_op = 'INSERT' or old.supersedes_id is distinct from new.supersedes_id) then
    update public.decisions set superseded_at = coalesce(superseded_at, now()) where id = new.supersedes_id;
  end if;
  if tg_op = 'UPDATE' and old.supersedes_id is not null and old.supersedes_id is distinct from new.supersedes_id then
    update public.decisions set superseded_at = null where id = old.supersedes_id;
  end if;
  return null;
end
$$;
create trigger mark_superseded after insert or update of supersedes_id on public.decisions
  for each row execute function whyspace_private.mark_superseded();

-- Finishing a task stamps completed_at, and clears the Inbox items that pointed at it.
create function whyspace_private.on_task_status()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
    if tg_op = 'UPDATE' then
      update public.inbox_items set done_at = coalesce(done_at, now()) where task_id = new.id;
    end if;
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(whyspace_private.my_profile_id(), new.created_by);
  end if;
  return new;
end
$$;
create trigger on_task_status before insert or update of status on public.tasks
  for each row execute function whyspace_private.on_task_status();

-- Sign-in: when someone's email is confirmed (Google sign-ins arrive confirmed), link them to
-- the profile invited under that email, or create a profile for them.
create function whyspace_private.handle_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  display_name text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'New member'
  );
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  if exists (select 1 from public.profiles where user_id = new.id) then
    return new;
  end if;
  update public.profiles
     set user_id = new.id,
         avatar_url = coalesce(avatar_url, new.raw_user_meta_data ->> 'avatar_url')
   where user_id is null and new.email is not null and lower(email) = lower(new.email);
  if not found then
    insert into public.profiles (user_id, name, email, avatar_url)
    values (new.id, display_name, new.email, new.raw_user_meta_data ->> 'avatar_url');
  end if;
  return new;
end
$$;
create trigger whyspace_on_auth_user
  after insert or update of email_confirmed_at on auth.users
  for each row execute function whyspace_private.handle_auth_user();

-- ---------------------------------------------------------------------------
-- RPCs the app calls
-- ---------------------------------------------------------------------------

-- Create a project; the creator becomes its owner.
create function public.create_project(p_name text, p_brief text default null)
returns public.projects
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := whyspace_private.my_profile_id();
  result public.projects;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  insert into public.projects (name, brief, created_by) values (p_name, p_brief, me) returning * into result;
  insert into public.project_members (project_id, profile_id, role) values (result.id, me, 'owner');
  return result;
end
$$;

-- Owners add people by email. Someone without an account gets a profile they claim on sign-in.
create function public.invite_member(p_project uuid, p_email text, p_name text default null, p_title text default null)
returns public.project_members
language plpgsql security definer set search_path = ''
as $$
declare
  target uuid;
  result public.project_members;
begin
  if not whyspace_private.is_owner(p_project) then
    raise exception 'Only project owners can invite' using errcode = '42501';
  end if;
  select id into target from public.profiles where lower(email) = lower(trim(p_email));
  if target is null then
    insert into public.profiles (name, email)
    values (coalesce(nullif(trim(p_name), ''), split_part(trim(p_email), '@', 1)), trim(p_email))
    returning id into target;
  end if;
  insert into public.project_members (project_id, profile_id, title)
  values (p_project, target, p_title)
  on conflict (project_id, profile_id) do update set title = coalesce(excluded.title, public.project_members.title)
  returning * into result;
  return result;
end
$$;

-- Record that I opened a project, for "since you were last here". Returns the previous visit.
create function public.mark_project_seen(p_project uuid)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  previous timestamptz;
begin
  select last_seen_at into previous from public.project_members
   where project_id = p_project and profile_id = whyspace_private.my_profile_id();
  update public.project_members set last_seen_at = now()
   where project_id = p_project and profile_id = whyspace_private.my_profile_id();
  return previous;
end
$$;

revoke execute on function public.create_project(text, text) from public, anon;
revoke execute on function public.invite_member(uuid, text, text, text) from public, anon;
revoke execute on function public.mark_project_seen(uuid) from public, anon;
grant execute on function public.create_project(text, text) to authenticated;
grant execute on function public.invite_member(uuid, text, text, text) to authenticated;
grant execute on function public.mark_project_seen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.parts enable row level security;
alter table public.milestones enable row level security;
alter table public.artifacts enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.meeting_next_steps enable row level security;
alter table public.decisions enable row level security;
alter table public.decision_deciders enable row level security;
alter table public.decision_evidence enable row level security;
alter table public.decision_options enable row level security;
alter table public.decision_links enable row level security;
alter table public.decision_reach enable row level security;
alter table public.decision_followers enable row level security;
alter table public.decision_seen enable row level security;
alter table public.decision_replies enable row level security;
alter table public.tasks enable row level security;
alter table public.task_subtasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.inbox_items enable row level security;
alter table public.inbox_item_artifacts enable row level security;
alter table public.activity enable row level security;

-- Profiles: you see yourself and people you share a project with; you edit only yourself.
-- New profiles come from sign-in or invite_member.
create policy "profiles: read teammates" on public.profiles for select to authenticated
  using (whyspace_private.can_see_profile(id));
create policy "profiles: edit self" on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Projects: members read; owners edit and delete. Create through create_project.
create policy "projects: members read" on public.projects for select to authenticated
  using (whyspace_private.is_member(id));
create policy "projects: owners edit" on public.projects for update to authenticated
  using (whyspace_private.is_owner(id)) with check (whyspace_private.is_owner(id));
create policy "projects: owners delete" on public.projects for delete to authenticated
  using (whyspace_private.is_owner(id));

-- Members: members see the roster; owners add, change and remove; anyone can leave.
create policy "members: members read" on public.project_members for select to authenticated
  using (whyspace_private.is_member(project_id));
create policy "members: owners add" on public.project_members for insert to authenticated
  with check (whyspace_private.is_owner(project_id));
create policy "members: owners edit" on public.project_members for update to authenticated
  using (whyspace_private.is_owner(project_id)) with check (whyspace_private.is_owner(project_id));
create policy "members: owners remove or leave" on public.project_members for delete to authenticated
  using (whyspace_private.is_owner(project_id) or profile_id = whyspace_private.my_profile_id());

-- Project-scoped tables: members do everything.
create policy "parts: members" on public.parts for all to authenticated
  using (whyspace_private.is_member(project_id)) with check (whyspace_private.is_member(project_id));
create policy "milestones: members" on public.milestones for all to authenticated
  using (whyspace_private.is_member(project_id)) with check (whyspace_private.is_member(project_id));
create policy "artifacts: members" on public.artifacts for all to authenticated
  using (whyspace_private.is_member(project_id)) with check (whyspace_private.is_member(project_id));
create policy "meetings: members" on public.meetings for all to authenticated
  using (whyspace_private.is_member(project_id)) with check (whyspace_private.is_member(project_id));
create policy "decisions: members" on public.decisions for all to authenticated
  using (whyspace_private.is_member(project_id)) with check (whyspace_private.is_member(project_id));
create policy "tasks: members" on public.tasks for all to authenticated
  using (whyspace_private.is_member(project_id)) with check (whyspace_private.is_member(project_id));

-- Child tables: follow the parent's project.
create policy "meeting_attendees: members" on public.meeting_attendees for all to authenticated
  using (whyspace_private.is_member(whyspace_private.meeting_project(meeting_id)))
  with check (whyspace_private.is_member(whyspace_private.meeting_project(meeting_id)));
create policy "meeting_next_steps: members" on public.meeting_next_steps for all to authenticated
  using (whyspace_private.is_member(whyspace_private.meeting_project(meeting_id)))
  with check (whyspace_private.is_member(whyspace_private.meeting_project(meeting_id)));
create policy "decision_deciders: members" on public.decision_deciders for all to authenticated
  using (whyspace_private.is_member(whyspace_private.decision_project(decision_id)))
  with check (whyspace_private.is_member(whyspace_private.decision_project(decision_id)));
create policy "decision_evidence: members" on public.decision_evidence for all to authenticated
  using (whyspace_private.is_member(whyspace_private.decision_project(decision_id)))
  with check (whyspace_private.is_member(whyspace_private.decision_project(decision_id)));
create policy "decision_options: members" on public.decision_options for all to authenticated
  using (whyspace_private.is_member(whyspace_private.decision_project(decision_id)))
  with check (whyspace_private.is_member(whyspace_private.decision_project(decision_id)));
create policy "decision_links: members" on public.decision_links for all to authenticated
  using (whyspace_private.is_member(whyspace_private.decision_project(decision_id)))
  with check (
    whyspace_private.is_member(whyspace_private.decision_project(decision_id))
    and whyspace_private.decision_project(led_from_id) = whyspace_private.decision_project(decision_id)
  );
create policy "decision_reach: members" on public.decision_reach for all to authenticated
  using (whyspace_private.is_member(whyspace_private.decision_project(decision_id)))
  with check (whyspace_private.is_member(whyspace_private.decision_project(decision_id)));
create policy "task_subtasks: members" on public.task_subtasks for all to authenticated
  using (whyspace_private.is_member(whyspace_private.task_project(task_id)))
  with check (whyspace_private.is_member(whyspace_private.task_project(task_id)));

-- Things a person does as themselves: members read all, write only their own.
create policy "decision_followers: members read" on public.decision_followers for select to authenticated
  using (whyspace_private.is_member(whyspace_private.decision_project(decision_id)));
create policy "decision_followers: follow" on public.decision_followers for insert to authenticated
  with check (profile_id = whyspace_private.my_profile_id() and whyspace_private.is_member(whyspace_private.decision_project(decision_id)));
create policy "decision_followers: unfollow" on public.decision_followers for delete to authenticated
  using (profile_id = whyspace_private.my_profile_id());

create policy "decision_seen: members read" on public.decision_seen for select to authenticated
  using (whyspace_private.is_member(whyspace_private.decision_project(decision_id)));
create policy "decision_seen: mark seen" on public.decision_seen for insert to authenticated
  with check (profile_id = whyspace_private.my_profile_id() and whyspace_private.is_member(whyspace_private.decision_project(decision_id)));
create policy "decision_seen: update seen" on public.decision_seen for update to authenticated
  using (profile_id = whyspace_private.my_profile_id()) with check (profile_id = whyspace_private.my_profile_id());

create policy "decision_replies: members read" on public.decision_replies for select to authenticated
  using (whyspace_private.is_member(whyspace_private.decision_project(decision_id)));
create policy "decision_replies: reply" on public.decision_replies for insert to authenticated
  with check (author_id = whyspace_private.my_profile_id() and whyspace_private.is_member(whyspace_private.decision_project(decision_id)));
create policy "decision_replies: edit own" on public.decision_replies for update to authenticated
  using (author_id = whyspace_private.my_profile_id()) with check (author_id = whyspace_private.my_profile_id());
create policy "decision_replies: delete own" on public.decision_replies for delete to authenticated
  using (author_id = whyspace_private.my_profile_id());

create policy "task_comments: members read" on public.task_comments for select to authenticated
  using (whyspace_private.is_member(whyspace_private.task_project(task_id)));
create policy "task_comments: comment" on public.task_comments for insert to authenticated
  with check (author_id = whyspace_private.my_profile_id() and whyspace_private.is_member(whyspace_private.task_project(task_id)));
create policy "task_comments: edit own" on public.task_comments for update to authenticated
  using (author_id = whyspace_private.my_profile_id()) with check (author_id = whyspace_private.my_profile_id());
create policy "task_comments: delete own" on public.task_comments for delete to authenticated
  using (author_id = whyspace_private.my_profile_id());

create policy "activity: members read" on public.activity for select to authenticated
  using (whyspace_private.is_member(project_id));
create policy "activity: set own" on public.activity for insert to authenticated
  with check (profile_id = whyspace_private.my_profile_id() and whyspace_private.is_member(project_id));
create policy "activity: update own" on public.activity for update to authenticated
  using (profile_id = whyspace_private.my_profile_id()) with check (profile_id = whyspace_private.my_profile_id());
create policy "activity: clear own" on public.activity for delete to authenticated
  using (profile_id = whyspace_private.my_profile_id());

-- Inbox: you see and manage only your own items. Members can send one to a teammate
-- (a mention); Whyspace's own items are written by the server with the service role.
create policy "inbox: read own" on public.inbox_items for select to authenticated
  using (recipient_id = whyspace_private.my_profile_id());
create policy "inbox: update own" on public.inbox_items for update to authenticated
  using (recipient_id = whyspace_private.my_profile_id()) with check (recipient_id = whyspace_private.my_profile_id());
create policy "inbox: delete own" on public.inbox_items for delete to authenticated
  using (recipient_id = whyspace_private.my_profile_id());
create policy "inbox: send to a teammate" on public.inbox_items for insert to authenticated
  with check (
    from_id = whyspace_private.my_profile_id()
    and author_is_ai = false
    and whyspace_private.is_member(project_id)
    and exists (select 1 from public.project_members m where m.project_id = inbox_items.project_id and m.profile_id = recipient_id)
  );

create policy "inbox_item_artifacts: read own" on public.inbox_item_artifacts for select to authenticated
  using (exists (select 1 from public.inbox_items i where i.id = inbox_item_id and i.recipient_id = whyspace_private.my_profile_id()));
create policy "inbox_item_artifacts: attach to sent" on public.inbox_item_artifacts for insert to authenticated
  with check (whyspace_private.inbox_sender(inbox_item_id) = whyspace_private.my_profile_id());

-- ---------------------------------------------------------------------------
-- Realtime: the app subscribes to these (RLS still applies).
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.decisions, public.tasks, public.artifacts, public.meetings,
      public.inbox_items, public.activity, public.decision_replies, public.decision_reach;
  end if;
end
$$;
