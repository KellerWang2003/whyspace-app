-- Access-rule checks against the Whiskr demo data. Run from the repo root with psql:
--   psql "$DATABASE_URL" -f supabase/tests/rls_check.sql
-- It loads demo_data.sql, signs in test users, runs the checks and rolls everything back,
-- so the database is left exactly as it was. Each check raises if it fails.
-- Use a local or branch database: it briefly writes test rows to auth.users.
begin;

\ir demo_data.sql

create or replace function pg_temp.sid(key text) returns uuid
language sql immutable as $$ select md5('whyspace-seed:' || key)::uuid $$;

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$ begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated, anon;
grant execute on function pg_temp.sid(text) to authenticated, anon;

-- Test sign-ins. Keller and Jordan claim their demo profiles by email.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'keller@whiskr.example', now(), '{"full_name": "Keller W"}'),
  ('00000000-0000-0000-0000-00000000000b', 'jordan.kim@studio.example', now(), '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@elsewhere.example', now(), '{"name": "Stranger"}'),
  ('00000000-0000-0000-0000-00000000000d', 'trevor@whiskr.example', null, '{}');

select pg_temp.check((select user_id from profiles where id = pg_temp.sid('MC')) = '00000000-0000-0000-0000-00000000000a', 'confirmed sign-in claims the invited profile');
select pg_temp.check((select name from profiles where user_id = '00000000-0000-0000-0000-00000000000c') = 'Stranger', 'new sign-in gets a new profile');
select pg_temp.check((select user_id from profiles where id = pg_temp.sid('TR')) is null, 'unconfirmed email does not claim a profile');

-- Anonymous: nothing.
set local role anon;
select pg_temp.check((select count(*) from projects) = 0, 'anon sees no projects');
select pg_temp.check((select count(*) from decisions) = 0, 'anon sees no decisions');
reset role;

-- Jordan: only Recall.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from projects) = 1, 'Jordan sees one project');
select pg_temp.check((select count(*) from decisions where project_id = pg_temp.sid('whiskr')) = 0, 'Jordan sees no Whiskr decisions');
select pg_temp.check((select count(*) from decision_evidence) = (select count(*) from decision_evidence e join decisions d on d.id = e.decision_id), 'Jordan sees only evidence of decisions he can see');
select pg_temp.check((select count(*) from profiles) = 2, 'Jordan sees only himself and Keller');
select pg_temp.check((select count(*) from inbox_items) = 0, 'Jordan sees none of Keller''s inbox');
do $$ begin
  insert into decisions (project_id, title) values (pg_temp.sid('whiskr'), 'Sneaky');
  raise exception 'FAILED: Jordan wrote to Whiskr';
exception when insufficient_privilege then raise notice 'ok: Jordan cannot write to Whiskr';
end $$;
update project_members set role = 'owner' where project_id = pg_temp.sid('studio') and profile_id = pg_temp.sid('JK');
select pg_temp.check((select role from project_members where project_id = pg_temp.sid('studio') and profile_id = pg_temp.sid('JK')) = 'member', 'a member cannot make themselves owner');
reset role;

-- Keller: both projects, his own inbox, confirming stamps him.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select count(*) from projects) = 2, 'Keller sees both projects');
select pg_temp.check((select count(*) from inbox_items) = 6, 'Keller sees his 6 inbox items');
update decisions set state = 'confirmed', confirmed_by = pg_temp.sid('TR') where id = pg_temp.sid('short');
select pg_temp.check((select confirmed_by = pg_temp.sid('MC') and confirmed_at > now() - interval '1 minute' from decisions where id = pg_temp.sid('short')), 'confirming records the signed-in person, not a passed value');
update decisions set confirmed_by = pg_temp.sid('TR') where id = pg_temp.sid('pounce');
select pg_temp.check((select confirmed_by from decisions where id = pg_temp.sid('pounce')) = pg_temp.sid('MC'), 'confirmed_by cannot be rewritten');
update tasks set status = 'done' where id = pg_temp.sid('t1');
select pg_temp.check((select done_at is not null from inbox_items where id = pg_temp.sid('i1')), 'finishing a task clears its inbox item');
select pg_temp.check((select completed_at is not null from tasks where id = pg_temp.sid('t1')), 'finishing a task stamps completed_at');
do $$ begin
  perform invite_member(pg_temp.sid('whiskr'), 'someone@elsewhere.example');
  raise exception 'FAILED: a member invited people';
exception when insufficient_privilege then raise notice 'ok: only owners invite';
end $$;
insert into decision_replies (decision_id, author_id, body) values (pg_temp.sid('nored'), pg_temp.sid('MC'), 'Updating the posters now.');
do $$ begin
  insert into decision_replies (decision_id, author_id, body) values (pg_temp.sid('nored'), pg_temp.sid('TR'), 'Fake reply');
  raise exception 'FAILED: replied as someone else';
exception when insufficient_privilege then raise notice 'ok: replies are only as yourself';
end $$;
insert into activity (project_id, profile_id, doing) values (pg_temp.sid('studio'), pg_temp.sid('MC'), 'x')
  on conflict (project_id, profile_id) do update set doing = 'Reviewing citations';
select pg_temp.check((select doing from activity where project_id = pg_temp.sid('studio') and profile_id = pg_temp.sid('MC')) = 'Reviewing citations', 'Keller updates his own activity');
reset role;

-- A stranger: sees nothing, can create a project and invite.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((select count(*) from projects) = 0, 'a stranger sees no projects');
select pg_temp.check((select count(*) from profiles) = 1, 'a stranger sees only themselves');
create temp table new_project on commit drop as select * from create_project('Stranger''s project', 'Testing');
grant select on new_project to authenticated;
select pg_temp.check((select count(*) from projects) = 1, 'create_project makes the creator a member');
select invite_member((select id from new_project), 'jordan.kim@studio.example', null, 'Guest');
select invite_member((select id from new_project), 'newperson@elsewhere.example', 'New Person');
select pg_temp.check((select count(*) from project_members where project_id = (select id from new_project)) = 3, 'owner invites existing and new people');
select pg_temp.check((select count(*) from profiles) = 3, 'the stranger now sees the people they invited');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from projects) = 2, 'Jordan sees the project he was invited to');
select pg_temp.check((select count(*) from profiles where name = 'Keller W' or id = pg_temp.sid('MC')) = 1, 'Jordan still sees Keller through Recall');
reset role;

rollback;
