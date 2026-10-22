-- Local dev / CI seed data. Never run against production.

insert into public.feedback (id, body, category, status, issue_number, issue_url, pr_url, author_hash, created_at) values
  ('00000000-0000-4000-8000-000000000001', 'Let the blob change colour when it is happy.', 'idea', 'shipped', 1, 'https://github.com/Jaspyplayz/petri/issues/1', 'https://github.com/Jaspyplayz/petri/pull/2', 'seed-author-1', now() - interval '6 days'),
  ('00000000-0000-4000-8000-000000000002', 'The feed button is hard to see on my phone.', 'bug', 'triaged', 3, 'https://github.com/Jaspyplayz/petri/issues/3', null, 'seed-author-2', now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000003', 'Give the blob a tiny hat.', 'idea', 'new', null, null, null, 'seed-author-3', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000004', 'Make the whole site a multiplayer MMO with payments.', 'idea', 'rejected', null, null, null, 'seed-author-4', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000005', 'Add a sleep mode so the blob naps at night.', 'idea', 'building', 4, 'https://github.com/Jaspyplayz/petri/issues/4', null, 'seed-author-5', now() - interval '12 hours');

insert into public.votes (feedback_id, voter_hash) values
  ('00000000-0000-4000-8000-000000000001', 'seed-voter-1'),
  ('00000000-0000-4000-8000-000000000001', 'seed-voter-2'),
  ('00000000-0000-4000-8000-000000000001', 'seed-voter-3'),
  ('00000000-0000-4000-8000-000000000002', 'seed-voter-1'),
  ('00000000-0000-4000-8000-000000000002', 'seed-voter-2'),
  ('00000000-0000-4000-8000-000000000003', 'seed-voter-4'),
  ('00000000-0000-4000-8000-000000000005', 'seed-voter-5');

insert into public.changelog (id, kind, title, summary, feedback_ids, pr_number, pr_url, commit_sha, trust_level, merged_at, reverts_id) values
  ('10000000-0000-4000-8000-000000000001', 'change', 'The blob blushes when you feed it',
   'Visitors asked for the blob to show when it is happy. It now turns a warmer colour for a moment after each feed, then fades back.',
   array['00000000-0000-4000-8000-000000000001']::uuid[], 2, 'https://github.com/Jaspyplayz/petri/pull/2', 'a1b2c3d', 0, now() - interval '5 days', null),
  ('10000000-0000-4000-8000-000000000002', 'change', 'Bigger wobble on poke',
   'Poking the blob now makes it wobble a little more so the reaction is easier to notice.',
   '{}', 5, 'https://github.com/Jaspyplayz/petri/pull/5', 'b2c3d4e', 0, now() - interval '2 days', null),
  ('10000000-0000-4000-8000-000000000003', 'revert', 'Reverted: Bigger wobble on poke',
   'The bigger wobble caused layout jumps on small screens, so it was rolled back automatically.',
   '{}', 6, 'https://github.com/Jaspyplayz/petri/pull/6', 'c3d4e5f', 0, now() - interval '1 day', '10000000-0000-4000-8000-000000000002');
