-- Access control. RLS is on for every table. The anon key may only SELECT public
-- columns of feedback (visible rows), changelog and app_flags. Every write goes
-- through server code or CI using the service role, which bypasses RLS.

alter table public.feedback enable row level security;
alter table public.votes enable row level security;
alter table public.feedback_reports enable row level security;
alter table public.changelog enable row level security;
alter table public.events enable row level security;
alter table public.agent_runs enable row level security;
alter table public.rate_limit_hits enable row level security;
alter table public.app_flags enable row level security;

-- Start from nothing for the public API roles, then grant column by column.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- New objects must be granted explicitly; nothing is exposed by default.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

grant select (
  id, body, category, status, vote_count, report_count, hidden,
  issue_number, issue_url, pr_url, created_at, updated_at
) on public.feedback to anon;

grant select on public.changelog to anon;
grant select on public.app_flags to anon;

create policy feedback_public_read on public.feedback
  for select to anon
  using (hidden = false);

create policy changelog_public_read on public.changelog
  for select to anon
  using (true);

create policy app_flags_public_read on public.app_flags
  for select to anon
  using (true);
