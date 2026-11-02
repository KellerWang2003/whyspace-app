-- Test-only demo data from the whyspace-wireframe prototype (src/data.ts, end of the Whiskr week):
-- Whiskr (a swipe app for cats, 4 people) and AI Studio · Recall (2 people).
-- "Today" in the prototype is Sun Oct 25 2026; times are Pacific.
--
-- The live project stays empty (Keller's call, Nov 2 2026). Don't run this file on its own
-- against it: rls_check.sql loads it inside a transaction and rolls everything back.
-- IDs are stable: sid('move') is the same uuid every run.

create or replace function pg_temp.sid(key text) returns uuid
language sql immutable as $$ select md5('whyspace-seed:' || key)::uuid $$;

-- This loads without a signed-in user, so the stamping triggers keep the
-- created_by / confirmed_by / completed_at values given below.

delete from public.projects where id in (pg_temp.sid('whiskr'), pg_temp.sid('studio'));

-- People -------------------------------------------------------------------

insert into public.profiles (id, name, email) values
  (pg_temp.sid('MC'), 'Keller', 'keller@whiskr.example'),
  (pg_temp.sid('CH'), 'Christine', 'christine@whiskr.example'),
  (pg_temp.sid('TR'), 'Trevor', 'trevor@whiskr.example'),
  (pg_temp.sid('KL'), 'Kelly', 'kelly@whiskr.example'),
  (pg_temp.sid('JK'), 'Jordan Kim', 'jordan.kim@studio.example')
on conflict (id) do update set name = excluded.name, email = excluded.email;

-- Projects -----------------------------------------------------------------

insert into public.projects (id, name, brief, summary, summary_updated_at, created_by, created_at) values
  (pg_temp.sid('whiskr'), 'Whiskr', 'A swipe app for cat playdates.',
   'A cat swipe app led by a purring dot in blue and yellow.', '2026-10-25 14:55-07',
   pg_temp.sid('CH'), '2026-10-05 10:00-07'),
  (pg_temp.sid('studio'), 'AI Studio · Recall', 'Recall turns course PDFs into cited practice questions. Prototype due Nov 4.',
   'Recall turns one PDF into five cited questions. Three things are open.', '2026-10-25 14:00-07',
   pg_temp.sid('MC'), '2026-09-30 10:00-07');

insert into public.project_members (project_id, profile_id, role, title, joined_at) values
  (pg_temp.sid('whiskr'), pg_temp.sid('CH'), 'owner', 'CEO', '2026-10-05 10:00-07'),
  (pg_temp.sid('whiskr'), pg_temp.sid('MC'), 'member', 'Chief marketing officer', '2026-10-05 10:00-07'),
  (pg_temp.sid('whiskr'), pg_temp.sid('TR'), 'member', 'Chief research officer', '2026-10-05 10:00-07'),
  (pg_temp.sid('whiskr'), pg_temp.sid('KL'), 'member', 'Chief product officer', '2026-10-05 10:00-07'),
  (pg_temp.sid('studio'), pg_temp.sid('MC'), 'owner', 'Interaction design and testing', '2026-09-30 10:00-07'),
  (pg_temp.sid('studio'), pg_temp.sid('JK'), 'member', 'Extraction, generation and evaluation', '2026-09-30 10:00-07');

-- Parts: the owner of a part's first decision leads it.
insert into public.parts (id, project_id, name, lead_id, position, summary, summary_updated_at) values
  (pg_temp.sid('whiskr/Research'), pg_temp.sid('whiskr'), 'Research', pg_temp.sid('TR'), 0, 'Cats only react to things that move.', '2026-10-22 16:00-07'),
  (pg_temp.sid('whiskr/App'), pg_temp.sid('whiskr'), 'App', pg_temp.sid('KL'), 1, 'A moving dot leads the swipe and purrs at 25 Hz.', '2026-10-22 16:00-07'),
  (pg_temp.sid('whiskr/Brand'), pg_temp.sid('whiskr'), 'Brand', pg_temp.sid('TR'), 2, 'Blue and yellow with the purring dot. No red.', '2026-10-23 11:05-07'),
  (pg_temp.sid('whiskr/Marketing'), pg_temp.sid('whiskr'), 'Marketing', pg_temp.sid('MC'), 3, 'A 15-second video opening on Luna''s pounce. The poster needs new colors.', '2026-10-25 14:55-07'),
  (pg_temp.sid('studio/Interviews'), pg_temp.sid('studio'), 'Interviews', pg_temp.sid('JK'), 0, 'Students review one lecture at a time.', '2026-10-13 18:00-07'),
  (pg_temp.sid('studio/Concept'), pg_temp.sid('studio'), 'Concept', pg_temp.sid('MC'), 1, 'Five cited questions from one course PDF.', '2026-10-24 18:00-07'),
  (pg_temp.sid('studio/Prototype'), pg_temp.sid('studio'), 'Prototype', pg_temp.sid('MC'), 2, 'One working loop by Nov 4. Keller: interaction; Jordan: generation.', '2026-10-21 19:00-07'),
  (pg_temp.sid('studio/Final crit'), pg_temp.sid('studio'), 'Final crit', pg_temp.sid('JK'), 3, 'Show the demo, the failures and what changed.', '2026-10-23 18:00-07');

insert into public.milestones (project_id, name, due_on, done_at, position) values
  (pg_temp.sid('whiskr'), 'Kickoff', '2026-10-05', '2026-10-05 17:00-07', 0),
  (pg_temp.sid('whiskr'), 'First cat test', '2026-10-21', '2026-10-21 17:00-07', 1),
  (pg_temp.sid('whiskr'), 'Cat-testable prototype', '2026-10-30', null, 2),
  (pg_temp.sid('whiskr'), 'Launch campaign', '2026-11-16', null, 3),
  (pg_temp.sid('studio'), 'Kickoff', '2026-09-30', '2026-09-30 17:00-07', 0),
  (pg_temp.sid('studio'), 'Concept review', '2026-10-15', '2026-10-15 17:00-07', 1),
  (pg_temp.sid('studio'), 'Prototype due', '2026-11-04', null, 2),
  (pg_temp.sid('studio'), 'Usability test', '2026-11-18', null, 3),
  (pg_temp.sid('studio'), 'Final crit', '2026-12-10', null, 4);

-- Artifacts ----------------------------------------------------------------

insert into public.artifacts (id, project_id, part_id, name, kind, tool, url, owner_id, is_evidence, version, meta, details, created_at, updated_at) values
  (pg_temp.sid('w1'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Brand'), 'Brand guidelines', 'design', 'Figma', null, pg_temp.sid('TR'), true, 'v3', 'Blue and yellow palette, purring dot · 18 frames', '{}', '2026-10-06 10:00-07', '2026-10-23 12:00-07'),
  (pg_temp.sid('w2'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Research'), 'Cat attention research', 'ai_output', 'Perplexity', null, pg_temp.sid('TR'), true, null, 'Perplexity · 3 sources on cat vision and vibration', '{}', '2026-10-22 15:42-07', '2026-10-23 10:30-07'),
  (pg_temp.sid('w3'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Research'), 'Cat test footage', 'video', null, null, pg_temp.sid('TR'), false, null, 'Luna and Miso · 3 clips', '{}', '2026-10-21 16:00-07', '2026-10-21 17:00-07'),
  (pg_temp.sid('w4'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/App'), 'App design', 'design', 'Figma', null, pg_temp.sid('KL'), false, null, 'Swipe card, matches · 24 frames', '{}', '2026-10-07 10:00-07', '2026-10-24 16:00-07'),
  (pg_temp.sid('w5'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/App'), 'Whiskr prototype', 'prototype', 'Claude Code', 'http://localhost:5173', pg_temp.sid('KL'), false, null, 'localhost:5173 · swipe card with purring dot', '{}', '2026-10-12 10:00-07', '2026-10-25 14:20-07'),
  (pg_temp.sid('w6'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Marketing'), 'Poster campaign', 'design', 'Figma', null, pg_temp.sid('MC'), false, null, '3 posters · needs the new palette', '{}', '2026-10-14 10:00-07', '2026-10-20 17:00-07'),
  (pg_temp.sid('w7'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Marketing'), 'Promo video plan', 'doc', 'Claude', null, pg_temp.sid('MC'), false, null, 'From Claude · 15 seconds, 3 beats',
   '{"content": {"heading": "Promo video plan", "paragraphs": ["0–5 s: Luna''s real pounce on the moving dot.", "5–10 s: The dot leads a swipe on the Whiskr card, purring.", "10–15 s: Blue and yellow end card with the logo."]}}',
   '2026-10-25 14:35-07', '2026-10-25 14:50-07'),
  (pg_temp.sid('w8'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Marketing'), 'Promo video', 'video', 'Runway', null, pg_temp.sid('MC'), false, null, 'Runway storyboard · set up from the plan', '{}', '2026-10-25 14:52-07', '2026-10-25 14:55-07'),
  (pg_temp.sid('a11'), pg_temp.sid('studio'), pg_temp.sid('studio/Interviews'), 'Recall · classmate interviews', 'doc', null, null, pg_temp.sid('JK'), true, null, '6 interviews · lecture-review habits', '{}', '2026-10-09 10:00-07', '2026-10-25 11:00-07'),
  (pg_temp.sid('a12'), pg_temp.sid('studio'), pg_temp.sid('studio/Interviews'), 'Recall · research themes', 'ai_output', 'Claude', null, pg_temp.sid('JK'), true, null, 'Claude synthesis · linked to interview quotes', '{}', '2026-10-13 10:00-07', '2026-10-24 15:00-07'),
  (pg_temp.sid('a13'), pg_temp.sid('studio'), pg_temp.sid('studio/Concept'), 'Recall · concept exploration', 'design', 'Figma', null, pg_temp.sid('MC'), false, null, '3 directions · selected PDF-to-practice loop', '{}', '2026-10-14 10:00-07', '2026-10-25 10:00-07'),
  (pg_temp.sid('a14'), pg_temp.sid('studio'), pg_temp.sid('studio/Concept'), 'AI Studio · project brief', 'doc', null, null, pg_temp.sid('JK'), false, null, 'Two-person project · Nov 4 prototype · Dec 10 critique', '{}', '2026-09-30 10:00-07', '2026-10-24 12:00-07'),
  (pg_temp.sid('a15'), pg_temp.sid('studio'), pg_temp.sid('studio/Prototype'), 'Recall · working prototype', 'prototype', null, null, pg_temp.sid('MC'), false, null, 'PDF upload, 5 questions, feedback, source preview', '{}', '2026-10-22 10:00-07', '2026-10-25 13:30-07'),
  (pg_temp.sid('a16'), pg_temp.sid('studio'), pg_temp.sid('studio/Prototype'), 'ai-studio/recall', 'repo', 'GitHub', null, pg_temp.sid('JK'), false, null, 'feat/source-citations · PR #7 · evaluation in progress',
   '{"files": ["src/upload/PdfUpload.tsx", "src/api/generate.ts", "evals/source-support.json"], "pr": "PR #7 · Return verified source passages · evaluation in progress"}',
   '2026-10-21 20:00-07', '2026-10-24 21:00-07'),
  (pg_temp.sid('a17'), pg_temp.sid('studio'), pg_temp.sid('studio/Final crit'), 'Recall · critique outline', 'doc', null, null, pg_temp.sid('JK'), false, null, 'Problem, demo, evaluation failures, next iteration', '{}', '2026-10-23 18:00-07', '2026-10-25 12:00-07');

-- Meetings -----------------------------------------------------------------

insert into public.meetings (id, project_id, title, host_id, status, starts_at, ends_at, summary, outcomes) values
  (pg_temp.sid('s1'), pg_temp.sid('whiskr'), 'Footage review', pg_temp.sid('TR'), 'ended', '2026-10-22 15:30-07', '2026-10-22 15:46-07',
   'Luna only reacted to movement. Kelly tried three interface directions; the moving dot won. Trevor''s research added a 25 Hz purr. Trevor marked the movement finding as important.',
   array['Luna only reacts to movement', 'The moving dot beat the wiggle and the feather', 'Movement marked as important for the whole team']),
  (pg_temp.sid('s2'), pg_temp.sid('whiskr'), 'Cat test with the prototype', pg_temp.sid('KL'), 'ended', '2026-10-21 14:00-07', '2026-10-21 14:40-07',
   null, array['Luna ignored the static card', 'Footage saved for review']),
  (pg_temp.sid('s3'), pg_temp.sid('whiskr'), 'Poster and video review', pg_temp.sid('MC'), 'scheduled', '2026-10-30 10:00-07', null, null, '{}'),
  (pg_temp.sid('s9'), pg_temp.sid('studio'), 'Recall prototype check-in', pg_temp.sid('MC'), 'scheduled', '2026-10-28 18:00-07', null, null, '{}'),
  (pg_temp.sid('s4'), pg_temp.sid('studio'), 'Scope our working AI prototype', pg_temp.sid('JK'), 'ended', '2026-10-21 18:00-07', '2026-10-21 18:45-07',
   'Build one real PDF-to-practice loop. Keller owns interaction design and testing; Jordan owns extraction, generation, and evaluation.',
   array['One real loop instead of a clickable mock', 'Roles split by interaction and generation']);

insert into public.meeting_attendees (meeting_id, profile_id) values
  (pg_temp.sid('s1'), pg_temp.sid('TR')), (pg_temp.sid('s1'), pg_temp.sid('KL')),
  (pg_temp.sid('s2'), pg_temp.sid('KL')), (pg_temp.sid('s2'), pg_temp.sid('TR')),
  (pg_temp.sid('s3'), pg_temp.sid('MC')), (pg_temp.sid('s3'), pg_temp.sid('CH')), (pg_temp.sid('s3'), pg_temp.sid('TR')), (pg_temp.sid('s3'), pg_temp.sid('KL')),
  (pg_temp.sid('s9'), pg_temp.sid('MC')), (pg_temp.sid('s9'), pg_temp.sid('JK')),
  (pg_temp.sid('s4'), pg_temp.sid('JK')), (pg_temp.sid('s4'), pg_temp.sid('MC'));

-- Decisions ----------------------------------------------------------------

insert into public.decisions (id, project_id, part_id, title, why, state, owner_id, origin, tool, snippet, meeting_id, supersedes_id, before_text, after_text, due_on, decided_at, confirmed_by, confirmed_at, created_by) values
  -- Whiskr
  (pg_temp.sid('red'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Brand'), 'Tuna red as the primary color',
   'Playful, food-related and bright on a phone.', 'confirmed', pg_temp.sid('TR'), 'person', 'Figma', null, null, null, null, null, null,
   '2026-10-08 11:00-07', pg_temp.sid('TR'), '2026-10-08 11:00-07', pg_temp.sid('TR')),
  (pg_temp.sid('move'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Research'), 'Every element should move to catch a cat''s attention',
   'Luna ignored the static card, then pounced on a moving notification.', 'confirmed', pg_temp.sid('TR'), 'meeting', 'Live session',
   'She only cares when something moves. We need the element to move.', pg_temp.sid('s1'), null, 'Static swipe card', 'Every element moves', null,
   '2026-10-22 15:36-07', pg_temp.sid('TR'), '2026-10-22 15:36-07', pg_temp.sid('TR')),
  (pg_temp.sid('dot'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/App'), 'A moving dot leads the swipe',
   'The dot works on the app, billboard and video.', 'confirmed', pg_temp.sid('KL'), 'meeting', 'Claude Code', null, pg_temp.sid('s1'), null,
   'Static swipe card', 'A moving dot leads the swipe', null,
   '2026-10-22 15:41-07', pg_temp.sid('KL'), '2026-10-22 15:41-07', pg_temp.sid('KL')),
  (pg_temp.sid('purr'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/App'), 'The dot purrs when it moves',
   'Cats feel a 25 Hz buzz through their paws, like a purr.', 'confirmed', pg_temp.sid('KL'), 'meeting', 'Perplexity', null, pg_temp.sid('s1'), null,
   null, null, null, '2026-10-22 15:45-07', pg_temp.sid('TR'), '2026-10-22 15:45-07', pg_temp.sid('TR')),
  (pg_temp.sid('dotbrand'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Brand'), 'The purring dot is a brand element',
   'Cats should recognize the dot everywhere, not just in the app.', 'confirmed', pg_temp.sid('TR'), 'person', 'Figma', null, null, null,
   null, null, null, '2026-10-22 17:30-07', pg_temp.sid('TR'), '2026-10-22 17:30-07', pg_temp.sid('TR')),
  (pg_temp.sid('nored'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Brand'), 'Drop red from the brand; use blue and yellow',
   'Cats see red as gray; blue and yellow stand out.', 'changed', pg_temp.sid('TR'), 'ai', 'Claude', null, null, pg_temp.sid('red'),
   'Tuna red', 'Blue and yellow', null, '2026-10-23 11:00-07', null, null, pg_temp.sid('TR')),
  (pg_temp.sid('pounce'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Marketing'), 'Open the video on Luna''s real pounce',
   'A real catch shows the idea in one second.', 'confirmed', pg_temp.sid('MC'), 'ai', 'Claude', null, null, null,
   null, null, null, '2026-10-25 14:40-07', pg_temp.sid('MC'), '2026-10-25 14:42-07', pg_temp.sid('MC')),
  (pg_temp.sid('short'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Marketing'), 'The promo video runs 15 seconds',
   'Inferred: cats lose interest fast.', 'inferred', pg_temp.sid('MC'), 'ai', 'Claude', 'Let''s keep it short, like 15 seconds.', null, null,
   null, null, null, '2026-10-25 14:50-07', null, null, pg_temp.sid('MC')),
  -- AI Studio · Recall
  (pg_temp.sid('cram'), pg_temp.sid('studio'), pg_temp.sid('studio/Interviews'), 'Focus on students reviewing one lecture at a time',
   'Students couldn''t tell what they understood after rereading.', 'confirmed', pg_temp.sid('JK'), 'ai', 'Claude', null, null, null,
   null, null, null, '2026-10-13 16:00-07', pg_temp.sid('JK'), '2026-10-13 16:00-07', pg_temp.sid('JK')),
  (pg_temp.sid('slides'), pg_temp.sid('studio'), pg_temp.sid('studio/Concept'), 'Generate five practice questions from one course PDF',
   'A full loop two people can build and test by Nov 4.', 'confirmed', pg_temp.sid('MC'), 'ai', 'Claude',
   'Upload, practice, check the explanation, and return to the source.', null, null,
   null, null, null, '2026-10-15 15:00-07', pg_temp.sid('MC'), '2026-10-15 15:00-07', pg_temp.sid('MC')),
  -- What the Oct 21 change replaced (the prototype only kept it as "was").
  (pg_temp.sid('mock'), pg_temp.sid('studio'), pg_temp.sid('studio/Prototype'), 'A clickable mock with prewritten questions',
   null, 'confirmed', pg_temp.sid('MC'), 'person', null, null, null, null,
   null, null, null, '2026-10-15 15:30-07', pg_temp.sid('MC'), '2026-10-15 15:30-07', pg_temp.sid('MC')),
  (pg_temp.sid('figma'), pg_temp.sid('studio'), pg_temp.sid('studio/Prototype'), 'Build one working upload-to-feedback flow',
   'Studio feedback: test real model mistakes, not a mock.', 'changed', pg_temp.sid('MC'), 'meeting', null, null, pg_temp.sid('s4'), pg_temp.sid('mock'),
   null, null, null, '2026-10-21 18:30-07', null, null, pg_temp.sid('MC')),
  (pg_temp.sid('deck'), pg_temp.sid('studio'), pg_temp.sid('studio/Final crit'), 'Show model failures alongside the successful demo',
   'The critique needs proof we iterated.', 'confirmed', pg_temp.sid('JK'), 'person', null, null, null, null,
   null, null, null, '2026-10-23 17:00-07', pg_temp.sid('JK'), '2026-10-23 17:00-07', pg_temp.sid('JK')),
  (pg_temp.sid('cite'), pg_temp.sid('studio'), pg_temp.sid('studio/Concept'), 'Attach a source page to every answer explanation',
   null, 'inferred', pg_temp.sid('JK'), 'ai', 'Cursor',
   'Only return questions with a supporting passage and a page number we can link back to.', null, null,
   null, null, null, '2026-10-24 16:00-07', null, null, pg_temp.sid('JK')),
  (pg_temp.sid('presenter'), pg_temp.sid('studio'), pg_temp.sid('studio/Final crit'), 'How should we split the demo and evaluation story?',
   null, 'open', pg_temp.sid('MC'), 'person', null, null, null, null,
   null, null, '2026-10-30', '2026-10-24 19:00-07', null, null, pg_temp.sid('JK'));

insert into public.decision_deciders (decision_id, profile_id) values
  (pg_temp.sid('red'), pg_temp.sid('TR')),
  (pg_temp.sid('move'), pg_temp.sid('TR')),
  (pg_temp.sid('dot'), pg_temp.sid('KL')), (pg_temp.sid('dot'), pg_temp.sid('TR')),
  (pg_temp.sid('purr'), pg_temp.sid('TR')),
  (pg_temp.sid('dotbrand'), pg_temp.sid('TR')),
  (pg_temp.sid('nored'), pg_temp.sid('TR')),
  (pg_temp.sid('pounce'), pg_temp.sid('MC')),
  (pg_temp.sid('short'), pg_temp.sid('MC')),
  (pg_temp.sid('cram'), pg_temp.sid('JK')),
  (pg_temp.sid('slides'), pg_temp.sid('MC')), (pg_temp.sid('slides'), pg_temp.sid('JK')),
  (pg_temp.sid('mock'), pg_temp.sid('MC')), (pg_temp.sid('mock'), pg_temp.sid('JK')),
  (pg_temp.sid('figma'), pg_temp.sid('MC')), (pg_temp.sid('figma'), pg_temp.sid('JK')),
  (pg_temp.sid('deck'), pg_temp.sid('JK'));

-- Replaced decisions were superseded when their replacement was made.
update public.decisions old set superseded_at = new.decided_at
from public.decisions new
where new.supersedes_id = old.id and new.project_id in (pg_temp.sid('whiskr'), pg_temp.sid('studio'));

insert into public.decision_evidence (decision_id, kind, label, detail, artifact_id, position) values
  (pg_temp.sid('move'), 'clip', 'Luna at 5:55', null, pg_temp.sid('w3'), 0),
  (pg_temp.sid('dot'), 'clip', 'Canvas comparison · footage review', 'Three directions compared live.', pg_temp.sid('w5'), 0),
  (pg_temp.sid('purr'), 'research', 'Perplexity · 3 sources', null, pg_temp.sid('w2'), 0),
  (pg_temp.sid('nored'), 'research', 'Cat vision research · Perplexity', null, pg_temp.sid('w2'), 0),
  (pg_temp.sid('short'), 'chat', 'Keller''s chat with Claude', '"Let''s keep it short, like 15 seconds."', null, 0),
  (pg_temp.sid('pounce'), 'clip', 'Luna''s pounce', 'The catch at 5:55 is the opening shot.', pg_temp.sid('w3'), 0),
  (pg_temp.sid('cram'), 'research', 'Six classmate interviews', null, pg_temp.sid('a11'), 0),
  (pg_temp.sid('cite'), 'test', 'First evaluation · 15 questions', '2 questions had no supporting passage.', pg_temp.sid('a16'), 0),
  (pg_temp.sid('figma'), 'feedback', 'Studio feedback · Oct 20', null, null, 0),
  (pg_temp.sid('deck'), 'test', 'First evaluation · 15 questions', null, pg_temp.sid('a16'), 0);

insert into public.decision_options (decision_id, title, why_not, position) values
  (pg_temp.sid('dot'), 'A wiggling card', 'Hard for a paw to hit', 0),
  (pg_temp.sid('dot'), 'A dangling feather', 'Covered the cat''s photo', 1),
  (pg_temp.sid('purr'), 'A chirp sound', 'Lost when the phone is on mute', 0),
  (pg_temp.sid('dotbrand'), 'Keep the dot in the app only', 'Cats wouldn''t know it elsewhere', 0),
  (pg_temp.sid('nored'), 'Keep red as an accent', 'Still reads as gray to cats', 0),
  (pg_temp.sid('short'), '30 seconds', 'Too long for cats', 0),
  (pg_temp.sid('pounce'), 'Open on the logo', 'Doesn''t show the idea', 0),
  (pg_temp.sid('slides'), 'Summaries of whole courses', 'Too big for Nov 4', 0);

-- "Led here from": the second decision builds on the first.
insert into public.decision_links (led_from_id, decision_id) values
  (pg_temp.sid('move'), pg_temp.sid('dot')),
  (pg_temp.sid('dot'), pg_temp.sid('purr')),
  (pg_temp.sid('purr'), pg_temp.sid('dotbrand')),
  (pg_temp.sid('dotbrand'), pg_temp.sid('pounce')),
  (pg_temp.sid('nored'), pg_temp.sid('pounce')),
  (pg_temp.sid('cram'), pg_temp.sid('slides')),
  (pg_temp.sid('slides'), pg_temp.sid('cite')),
  (pg_temp.sid('slides'), pg_temp.sid('figma')),
  (pg_temp.sid('figma'), pg_temp.sid('deck'));

insert into public.decision_replies (decision_id, author_id, body, created_at) values
  (pg_temp.sid('nored'), pg_temp.sid('MC'), 'Posters too? They''re mostly for owners.', '2026-10-23 12:10-07'),
  (pg_temp.sid('nored'), pg_temp.sid('TR'), 'Yes, anything cats might see.', '2026-10-23 12:25-07');

insert into public.decision_followers (decision_id, profile_id) values
  (pg_temp.sid('nored'), pg_temp.sid('CH')), (pg_temp.sid('short'), pg_temp.sid('CH')), (pg_temp.sid('dotbrand'), pg_temp.sid('CH')),
  (pg_temp.sid('dotbrand'), pg_temp.sid('MC')),
  (pg_temp.sid('nored'), pg_temp.sid('KL')),
  (pg_temp.sid('pounce'), pg_temp.sid('TR'));

-- Tasks --------------------------------------------------------------------

insert into public.tasks (id, project_id, part_id, title, description, owner_id, due_on, status, priority, decision_id, prompt, tool, origin, completed_at, created_by, created_at) values
  (pg_temp.sid('t7'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Marketing'), 'Review the poster and promo video before launch', null,
   pg_temp.sid('CH'), '2026-10-30', 'todo', 'medium', pg_temp.sid('short'), null, null, 'person', null, pg_temp.sid('CH'), '2026-10-25 14:58-07'),
  (pg_temp.sid('t1'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Marketing'), 'Update the poster for the moving dot and new palette', 'Swap tuna red for blue and yellow; add the dot.',
   pg_temp.sid('MC'), '2026-10-30', 'todo', 'high', pg_temp.sid('nored'),
   'Recolor the 3 posters to the blue and yellow in brand guidelines v3 and add the purring dot. Cats see red as gray.', 'Figma', 'ai', null, null, '2026-10-24 15:00-07'),
  (pg_temp.sid('t2'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Marketing'), 'Plan and storyboard the 15-second promo video', null,
   pg_temp.sid('MC'), '2026-11-02', 'in_progress', 'high', pg_temp.sid('short'), null, null, 'person', null, pg_temp.sid('MC'), '2026-10-25 14:30-07'),
  (pg_temp.sid('t3'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/App'), 'Build the purring dot into the swipe card', null,
   pg_temp.sid('KL'), '2026-10-30', 'in_progress', 'high', pg_temp.sid('purr'), null, null, 'meeting', null, pg_temp.sid('KL'), '2026-10-22 15:47-07'),
  (pg_temp.sid('t4'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/App'), 'Recolor the app to blue and yellow', 'App buttons still use tuna red.',
   pg_temp.sid('KL'), '2026-10-29', 'done', 'medium', pg_temp.sid('nored'),
   'Replace tuna red in the swipe card with the blue and yellow tokens from brand guidelines v3. Cats see red as gray.', 'Claude Code', 'ai', '2026-10-24 17:00-07', null, '2026-10-23 13:00-07'),
  (pg_temp.sid('t5'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Brand'), 'Add the purring dot to the brand guidelines', null,
   pg_temp.sid('TR'), '2026-10-23', 'done', 'medium', pg_temp.sid('dotbrand'), null, null, 'meeting', '2026-10-23 12:00-07', pg_temp.sid('TR'), '2026-10-22 15:47-07'),
  (pg_temp.sid('t6'), pg_temp.sid('whiskr'), pg_temp.sid('whiskr/Research'), 'Review Monday''s cat-test footage', null,
   pg_temp.sid('TR'), '2026-10-22', 'done', 'medium', pg_temp.sid('move'), null, null, 'meeting', '2026-10-22 15:46-07', pg_temp.sid('TR'), '2026-10-21 14:41-07'),
  (pg_temp.sid('t11'), pg_temp.sid('studio'), pg_temp.sid('studio/Prototype'), 'Connect Recall’s upload, quiz, and feedback screens', 'Use Jordan’s endpoint. Design loading, failure and retry states.',
   pg_temp.sid('MC'), '2026-10-28', 'in_progress', 'high', pg_temp.sid('figma'), null, null, 'meeting', null, pg_temp.sid('MC'), '2026-10-21 18:46-07'),
  (pg_temp.sid('t12'), pg_temp.sid('studio'), pg_temp.sid('studio/Prototype'), 'Design a source citation that opens the right PDF page', 'Verify an answer without losing the question.',
   pg_temp.sid('MC'), '2026-10-29', 'todo', 'high', pg_temp.sid('cite'), null, null, 'person', null, pg_temp.sid('MC'), '2026-10-24 17:00-07'),
  (pg_temp.sid('t13'), pg_temp.sid('studio'), pg_temp.sid('studio/Prototype'), 'Evaluate generated questions on three course PDFs', 'Score 15 questions for support, correctness and clarity.',
   pg_temp.sid('JK'), '2026-10-27', 'in_progress', 'high', pg_temp.sid('slides'), null, null, 'meeting', null, pg_temp.sid('JK'), '2026-10-21 18:46-07'),
  (pg_temp.sid('t14'), pg_temp.sid('studio'), pg_temp.sid('studio/Interviews'), 'Schedule four classmate tests for the working prototype', 'Each brings one course PDF.',
   pg_temp.sid('MC'), '2026-10-30', 'todo', 'medium', null, null, null, 'person', null, pg_temp.sid('MC'), '2026-10-23 10:00-07'),
  (pg_temp.sid('t15'), pg_temp.sid('studio'), pg_temp.sid('studio/Final crit'), 'Outline our critique story and divide presentation roles', null,
   pg_temp.sid('JK'), '2026-10-30', 'todo', 'medium', pg_temp.sid('deck'), null, null, 'person', null, pg_temp.sid('JK'), '2026-10-23 17:05-07'),
  (pg_temp.sid('t16'), pg_temp.sid('studio'), pg_temp.sid('studio/Interviews'), 'Interview six classmates about reviewing lectures', null,
   pg_temp.sid('JK'), '2026-10-13', 'done', 'high', pg_temp.sid('cram'), null, null, 'person', '2026-10-13 15:00-07', pg_temp.sid('JK'), '2026-10-06 10:00-07');

insert into public.task_subtasks (task_id, title, done, position) values
  (pg_temp.sid('t2'), 'Write the plan with Claude', true, 0),
  (pg_temp.sid('t2'), 'Storyboard in Runway', false, 1),
  (pg_temp.sid('t2'), 'Review with Christine', false, 2),
  (pg_temp.sid('t11'), 'Upload and processing states', true, 0),
  (pg_temp.sid('t11'), 'Answer submission and feedback', false, 1),
  (pg_temp.sid('t11'), 'Source-page preview and retry', false, 2);

insert into public.task_comments (task_id, author_id, body, created_at) values
  (pg_temp.sid('t15'), pg_temp.sid('JK'), 'Can you cover the interaction changes? I’ll take evaluation.', '2026-10-24 20:00-07');

insert into public.meeting_next_steps (meeting_id, profile_id, body, task_id, position) values
  (pg_temp.sid('s1'), pg_temp.sid('KL'), 'Build the purring dot into the swipe card', pg_temp.sid('t3'), 0),
  (pg_temp.sid('s1'), pg_temp.sid('TR'), 'Add the purring dot to the brand guidelines', pg_temp.sid('t5'), 1),
  (pg_temp.sid('s2'), pg_temp.sid('TR'), 'Review the footage before Thursday', pg_temp.sid('t6'), 0),
  (pg_temp.sid('s4'), pg_temp.sid('MC'), 'Connect the upload, quiz and feedback screens', pg_temp.sid('t11'), 0),
  (pg_temp.sid('s4'), pg_temp.sid('JK'), 'Evaluate questions on three course PDFs', pg_temp.sid('t13'), 1);

-- Reach: the artifacts each decision affects. A task means the artifact needs an update
-- until it's done. Seen = who opened the decision since it changed.
insert into public.decision_reach (decision_id, artifact_id, task_id) values
  (pg_temp.sid('move'), pg_temp.sid('w5'), null), (pg_temp.sid('move'), pg_temp.sid('w4'), null),
  (pg_temp.sid('dot'), pg_temp.sid('w4'), null), (pg_temp.sid('dot'), pg_temp.sid('w5'), pg_temp.sid('t3')),
  (pg_temp.sid('purr'), pg_temp.sid('w5'), pg_temp.sid('t3')),
  (pg_temp.sid('red'), pg_temp.sid('w1'), null), (pg_temp.sid('red'), pg_temp.sid('w6'), null),
  (pg_temp.sid('dotbrand'), pg_temp.sid('w1'), pg_temp.sid('t5')), (pg_temp.sid('dotbrand'), pg_temp.sid('w6'), pg_temp.sid('t1')), (pg_temp.sid('dotbrand'), pg_temp.sid('w8'), null),
  (pg_temp.sid('nored'), pg_temp.sid('w1'), null), (pg_temp.sid('nored'), pg_temp.sid('w4'), pg_temp.sid('t4')), (pg_temp.sid('nored'), pg_temp.sid('w5'), pg_temp.sid('t4')), (pg_temp.sid('nored'), pg_temp.sid('w6'), pg_temp.sid('t1')),
  (pg_temp.sid('short'), pg_temp.sid('w7'), null), (pg_temp.sid('short'), pg_temp.sid('w8'), pg_temp.sid('t2')),
  (pg_temp.sid('pounce'), pg_temp.sid('w7'), null), (pg_temp.sid('pounce'), pg_temp.sid('w8'), pg_temp.sid('t2')),
  (pg_temp.sid('cram'), pg_temp.sid('a12'), null),
  (pg_temp.sid('slides'), pg_temp.sid('a13'), null), (pg_temp.sid('slides'), pg_temp.sid('a15'), null),
  (pg_temp.sid('cite'), pg_temp.sid('a15'), pg_temp.sid('t12')), (pg_temp.sid('cite'), pg_temp.sid('a16'), null),
  (pg_temp.sid('figma'), pg_temp.sid('a15'), pg_temp.sid('t11')), (pg_temp.sid('figma'), pg_temp.sid('a16'), null),
  (pg_temp.sid('deck'), pg_temp.sid('a17'), pg_temp.sid('t15')),
  (pg_temp.sid('presenter'), pg_temp.sid('a17'), null);

insert into public.decision_seen (decision_id, profile_id, seen_at)
select pg_temp.sid(d), pg_temp.sid(p), '2026-10-25 14:59-07'
from (values
  ('move', 'KL'), ('move', 'TR'), ('move', 'MC'),
  ('dot', 'KL'), ('dot', 'TR'),
  ('purr', 'KL'), ('purr', 'TR'),
  ('red', 'TR'), ('red', 'MC'),
  ('dotbrand', 'TR'), ('dotbrand', 'KL'), ('dotbrand', 'MC'),
  ('nored', 'TR'), ('nored', 'CH'), ('nored', 'KL'),
  ('short', 'MC'),
  ('pounce', 'MC'), ('pounce', 'TR'),
  ('cram', 'JK'), ('cram', 'MC'),
  ('slides', 'MC'), ('slides', 'JK'),
  ('cite', 'JK'),
  ('figma', 'MC'), ('figma', 'JK'),
  ('deck', 'JK'),
  ('presenter', 'JK'), ('presenter', 'MC')
) as s(d, p);

-- Inbox: one row per recipient ----------------------------------------------

insert into public.inbox_items (id, project_id, recipient_id, kind, need, from_id, author_is_ai, source, summary, body, touches, decision_id, task_id, created_at, read_at, done_at) values
  (pg_temp.sid('i4'), pg_temp.sid('whiskr'), pg_temp.sid('KL'), 'alert', 'do', pg_temp.sid('TR'), true, 'Trevor''s brand guidelines update',
   'Recolor the app: Trevor dropped red from the brand', 'Red is out. Your task and Claude Code prompt are ready.', 'Your app design and prototype',
   pg_temp.sid('nored'), pg_temp.sid('t4'), '2026-10-23 13:00-07', '2026-10-23 14:00-07', '2026-10-24 17:00-07'),
  (pg_temp.sid('i5'), pg_temp.sid('whiskr'), pg_temp.sid('TR'), 'mention', 'decide', pg_temp.sid('MC'), true, 'Keller''s chat with Claude',
   'Keller''s promo video plan builds on your brand guidelines', 'Check the video plan matches your guidelines.', 'Your brand guidelines',
   pg_temp.sid('short'), null, '2026-10-25 14:40-07', null, null),
  (pg_temp.sid('i9'), pg_temp.sid('whiskr'), pg_temp.sid('CH'), 'change', null, pg_temp.sid('MC'), true, 'Weekly digest',
   'This week: red is out, the dot moves', 'The video length waits on Keller; the poster still uses red.', 'Marketing, which you follow',
   pg_temp.sid('short'), null, '2026-10-25 14:00-07', null, null),
  (pg_temp.sid('i1'), pg_temp.sid('whiskr'), pg_temp.sid('MC'), 'alert', 'do', pg_temp.sid('TR'), true, 'Trevor''s brand guidelines update',
   'Update your poster: Trevor dropped red from the brand', 'Your poster still uses red. Your task and Figma prompt are ready.', 'Your poster campaign',
   pg_temp.sid('nored'), pg_temp.sid('t1'), '2026-10-24 15:00-07', null, null),
  (pg_temp.sid('i2/MC'), pg_temp.sid('whiskr'), pg_temp.sid('MC'), 'change', null, pg_temp.sid('TR'), true, 'Footage review · live session',
   'Every element should move to catch a cat''s attention', 'Trevor marked this important. It affects the poster and video.', 'Your poster and promo video',
   pg_temp.sid('move'), null, '2026-10-23 15:00-07', '2026-10-23 16:00-07', null),
  (pg_temp.sid('i2/CH'), pg_temp.sid('whiskr'), pg_temp.sid('CH'), 'change', null, pg_temp.sid('TR'), true, 'Footage review · live session',
   'Every element should move to catch a cat''s attention', 'Trevor marked this important. It affects the poster and video.', 'Your poster and promo video',
   pg_temp.sid('move'), null, '2026-10-23 15:00-07', '2026-10-23 18:00-07', null),
  (pg_temp.sid('i3'), pg_temp.sid('whiskr'), pg_temp.sid('MC'), 'review', 'decide', pg_temp.sid('MC'), true, 'Your chat with Claude',
   'Confirm why the promo video runs 15 seconds', 'Claude inferred the reason from your chat. Confirm or correct it.', 'Your promo video plan',
   pg_temp.sid('short'), null, '2026-10-25 14:50-07', null, null),
  (pg_temp.sid('i8'), pg_temp.sid('studio'), pg_temp.sid('MC'), 'review', 'decide', pg_temp.sid('JK'), true, 'Jordan’s source-citation implementation update',
   'Jordan proposed a source page on every answer', 'Check how citations fit your feedback screen.', 'Your feedback screen',
   pg_temp.sid('cite'), null, '2026-10-25 14:00-07', null, null),
  (pg_temp.sid('i7'), pg_temp.sid('studio'), pg_temp.sid('MC'), 'alert', 'decide', pg_temp.sid('JK'), true, 'Jordan’s first question evaluation · 15 questions',
   'Two questions have no source passage', 'Reject them, or show an unavailable state?', 'Your working prototype',
   pg_temp.sid('slides'), null, '2026-10-25 11:00-07', null, null),
  (pg_temp.sid('i6'), pg_temp.sid('studio'), pg_temp.sid('MC'), 'mention', null, pg_temp.sid('JK'), false, 'Comment in Recall · critique outline',
   'Jordan mentioned you in the critique outline', '“Can you show the interaction changes? I’ll cover evaluation.”', 'Your part of the critique',
   pg_temp.sid('presenter'), null, '2026-10-24 15:00-07', '2026-10-24 16:00-07', null);

insert into public.inbox_item_artifacts (inbox_item_id, artifact_id, context, position) values
  (pg_temp.sid('i4'), pg_temp.sid('w1'), 'Brand guidelines · new palette', 0),
  (pg_temp.sid('i4'), pg_temp.sid('w5'), 'Swipe card prototype · buttons still red', 1),
  (pg_temp.sid('i5'), pg_temp.sid('w7'), 'Promo video plan', 0),
  (pg_temp.sid('i5'), pg_temp.sid('w1'), 'Brand guidelines · palette and the purring dot', 1),
  (pg_temp.sid('i9'), pg_temp.sid('w7'), 'Promo video plan · length not confirmed', 0),
  (pg_temp.sid('i1'), pg_temp.sid('w1'), 'Brand guidelines · new palette', 0),
  (pg_temp.sid('i1'), pg_temp.sid('w6'), 'Poster campaign · still uses tuna red', 1),
  (pg_temp.sid('i2/MC'), pg_temp.sid('w3'), 'Luna at 5:55', 0),
  (pg_temp.sid('i2/MC'), pg_temp.sid('w5'), 'Swipe card prototype', 1),
  (pg_temp.sid('i2/CH'), pg_temp.sid('w3'), 'Luna at 5:55', 0),
  (pg_temp.sid('i2/CH'), pg_temp.sid('w5'), 'Swipe card prototype', 1),
  (pg_temp.sid('i3'), pg_temp.sid('w7'), 'Promo video plan', 0),
  (pg_temp.sid('i8'), pg_temp.sid('a16'), 'Endpoint changes · verified source passages', 0),
  (pg_temp.sid('i8'), pg_temp.sid('a15'), 'Feedback screen and source preview', 1),
  (pg_temp.sid('i7'), pg_temp.sid('a16'), 'Evaluation cases and source-support results', 0),
  (pg_temp.sid('i7'), pg_temp.sid('a15'), 'Current behavior for unsupported answers', 1),
  (pg_temp.sid('i6'), pg_temp.sid('a17'), 'The critique outline where Jordan mentioned you', 0),
  (pg_temp.sid('i6'), pg_temp.sid('a15'), 'Interaction changes for the demo', 1);

-- Activity: who's working on what right now ---------------------------------

insert into public.activity (project_id, profile_id, part_id, artifact_id, tool, doing, ai_doing, state, started_at) values
  (pg_temp.sid('whiskr'), pg_temp.sid('MC'), pg_temp.sid('whiskr/Marketing'), pg_temp.sid('w7'), 'Claude', 'Promo video', 'Drafting the promo video plan', 'active', '2026-10-25 14:35-07'),
  (pg_temp.sid('whiskr'), pg_temp.sid('KL'), pg_temp.sid('whiskr/App'), pg_temp.sid('w5'), 'Claude Code', 'Swipe card', 'Adding the purr buzz to the dot', 'active', '2026-10-25 14:20-07'),
  (pg_temp.sid('whiskr'), pg_temp.sid('TR'), pg_temp.sid('whiskr/Research'), pg_temp.sid('w2'), 'Perplexity', 'Cat vision research', 'Researching what cats see', 'active', '2026-10-25 14:00-07'),
  (pg_temp.sid('whiskr'), pg_temp.sid('CH'), pg_temp.sid('whiskr/Brand'), null, null, 'Reviewed the week''s decisions', null, 'idle', '2026-10-24 17:00-07'),
  (pg_temp.sid('studio'), pg_temp.sid('MC'), pg_temp.sid('studio/Prototype'), pg_temp.sid('a15'), 'Claude', 'Recall feedback and source preview', 'Exploring citation states', 'active', '2026-10-25 14:00-07'),
  (pg_temp.sid('studio'), pg_temp.sid('JK'), pg_temp.sid('studio/Prototype'), pg_temp.sid('a16'), 'Cursor', 'Recall evaluation on three course PDFs', 'Scoring questions against sources', 'active', '2026-10-25 14:15-07');
