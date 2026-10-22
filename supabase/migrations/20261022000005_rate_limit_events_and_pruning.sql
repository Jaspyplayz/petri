-- Rate-limit analytics events too, and prune rate_limit_hits globally so rows
-- from IP hashes that never come back don't accumulate. Every window in use is
-- at most one hour; anything older than a day can always go.

alter table public.rate_limit_hits drop constraint rate_limit_hits_action_check;
alter table public.rate_limit_hits
  add constraint rate_limit_hits_action_check check (action in ('post', 'vote', 'report', 'event'));

create or replace function public.consume_rate_limit(
  p_ip_hash text,
  p_action text,
  p_limit integer,
  p_window interval
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  recent integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash || ':' || p_action, 0));

  delete from public.rate_limit_hits
    where created_at < now() - greatest(p_window, interval '1 day');

  delete from public.rate_limit_hits
    where ip_hash = p_ip_hash
      and action = p_action
      and created_at < now() - p_window;

  select count(*) into recent
    from public.rate_limit_hits
    where ip_hash = p_ip_hash
      and action = p_action
      and created_at >= now() - p_window;

  if recent >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_hits (ip_hash, action) values (p_ip_hash, p_action);
  return true;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, interval) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, interval) to service_role;
