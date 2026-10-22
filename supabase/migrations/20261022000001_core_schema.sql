-- Petri core schema: feedback board, votes, reports, changelog, analytics events, agent runs.
-- Access rules (RLS + grants) live in the next migration.

create type public.feedback_category as enum ('idea', 'bug');
create type public.feedback_status as enum ('new', 'triaged', 'building', 'shipped', 'rejected');
create type public.changelog_kind as enum ('change', 'revert');
create type public.agent_run_status as enum ('pass', 'fail', 'skipped', 'error');

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(btrim(body)) between 1 and 280),
  category public.feedback_category not null,
  status public.feedback_status not null default 'new',
  vote_count integer not null default 0 check (vote_count >= 0),
  report_count integer not null default 0 check (report_count >= 0),
  hidden boolean not null default false,
  issue_number integer check (issue_number > 0),
  issue_url text,
  pr_url text,
  author_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_visible_by_votes_idx
  on public.feedback (vote_count desc, created_at desc)
  where hidden = false;
create index feedback_visible_by_newest_idx
  on public.feedback (created_at desc)
  where hidden = false;
create index feedback_status_idx on public.feedback (status);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback (id) on delete cascade,
  voter_hash text not null,
  created_at timestamptz not null default now(),
  unique (feedback_id, voter_hash)
);

create table public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback (id) on delete cascade,
  reporter_hash text not null,
  created_at timestamptz not null default now(),
  unique (feedback_id, reporter_hash)
);

create table public.changelog (
  id uuid primary key default gen_random_uuid(),
  kind public.changelog_kind not null default 'change',
  title text not null check (char_length(title) between 1 and 200),
  summary text not null check (char_length(summary) between 1 and 2000),
  feedback_ids uuid[] not null default '{}',
  pr_number integer check (pr_number > 0),
  pr_url text,
  commit_sha text check (commit_sha ~ '^[0-9a-f]{7,40}$'),
  trust_level smallint not null check (trust_level between 0 and 4),
  before_screenshot_urls text[] not null default '{}',
  after_screenshot_urls text[] not null default '{}',
  reverts_id uuid references public.changelog (id),
  merged_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((kind = 'revert') = (reverts_id is not null))
);

create index changelog_merged_at_idx on public.changelog (merged_at desc);
create index changelog_reverts_id_idx on public.changelog (reverts_id);

create table public.events (
  id bigint generated always as identity primary key,
  feature_id text not null check (feature_id ~ '^[a-z][a-z0-9-]{0,39}$'),
  action text not null check (action ~ '^[a-z][a-z0-9_-]{0,39}$'),
  path text not null check (char_length(path) between 1 and 200),
  created_at timestamptz not null default now()
);

create index events_feature_created_idx on public.events (feature_id, created_at desc);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workflow text not null check (
    workflow in ('triage', 'build', 'verify', 'automerge', 'post-merge', 'guardian', 'postmortem', 'evals')
  ),
  gh_run_id bigint,
  gh_run_url text,
  issue_number integer,
  pr_number integer,
  model text,
  status public.agent_run_status not null,
  turns integer check (turns >= 0),
  duration_ms integer check (duration_ms >= 0),
  details jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index agent_runs_started_at_idx on public.agent_runs (started_at desc);

create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  action text not null check (action in ('post', 'vote', 'report')),
  created_at timestamptz not null default now()
);

create index rate_limit_hits_lookup_idx on public.rate_limit_hits (ip_hash, action, created_at desc);
create index rate_limit_hits_created_at_idx on public.rate_limit_hits (created_at);

create table public.app_flags (
  key text primary key check (key in ('feedback_open', 'read_only_mode')),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_flags (key, value) values
  ('feedback_open', 'true'),
  ('read_only_mode', 'false');

-- Triggers -------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger feedback_touch_updated_at
  before update on public.feedback
  for each row execute function public.touch_updated_at();

create trigger app_flags_touch_updated_at
  before update on public.app_flags
  for each row execute function public.touch_updated_at();

create function public.sync_feedback_vote_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.feedback set vote_count = vote_count + 1 where id = new.feedback_id;
  elsif tg_op = 'DELETE' then
    update public.feedback set vote_count = greatest(vote_count - 1, 0) where id = old.feedback_id;
  end if;
  return null;
end;
$$;

create trigger votes_sync_count
  after insert or delete on public.votes
  for each row execute function public.sync_feedback_vote_count();

-- Items with this many reports are hidden from the public board.
create function public.sync_feedback_report_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.feedback
      set report_count = report_count + 1,
          hidden = hidden or report_count + 1 >= 3
      where id = new.feedback_id;
  elsif tg_op = 'DELETE' then
    update public.feedback
      set report_count = greatest(report_count - 1, 0)
      where id = old.feedback_id;
  end if;
  return null;
end;
$$;

create trigger feedback_reports_sync_count
  after insert or delete on public.feedback_reports
  for each row execute function public.sync_feedback_report_count();
