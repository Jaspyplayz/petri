-- Atomic per-IP-hash rate limiting. Returns true and records a hit when the caller
-- is under the limit for the rolling window; returns false (and records nothing)
-- otherwise. A transaction-scoped advisory lock per (hash, action) makes the
-- check-then-insert race-free. Callable by the service role only.

create function public.consume_rate_limit(
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
