-- One vote per browser, with a cap per network. voter_hash now comes from a random id in the
-- voter's cookie, so several people on one connection can each vote. ip_hash keeps the
-- network, so one connection can't stuff an item past p_ip_cap votes by clearing cookies.
-- Additive only: before this, voter_hash was the IP hash, so old rows copy it into ip_hash
-- and keep counting toward their network's cap.

alter table public.votes add column ip_hash text;

update public.votes set ip_hash = voter_hash where ip_hash is null;

create index votes_feedback_ip_idx on public.votes (feedback_id, ip_hash);

-- Returns 'voted', 'already_voted' (this browser voted on it before), 'ip_cap' (this
-- network has p_ip_cap votes on it) or 'not_found'. A transaction-scoped advisory lock
-- per (feedback, network) makes the count-then-insert race-free. Service role only.
create function public.cast_vote(
  p_feedback_id uuid,
  p_voter_hash text,
  p_ip_hash text,
  p_ip_cap integer
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  from_network integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_feedback_id::text || ':' || p_ip_hash, 0));

  if not exists (select 1 from public.feedback where id = p_feedback_id) then
    return 'not_found';
  end if;

  if exists (select 1 from public.votes where feedback_id = p_feedback_id and voter_hash = p_voter_hash) then
    return 'already_voted';
  end if;

  select count(*) into from_network
    from public.votes
    where feedback_id = p_feedback_id
      and ip_hash = p_ip_hash;

  if from_network >= p_ip_cap then
    return 'ip_cap';
  end if;

  insert into public.votes (feedback_id, voter_hash, ip_hash)
    values (p_feedback_id, p_voter_hash, p_ip_hash)
    on conflict (feedback_id, voter_hash) do nothing;
  if not found then
    return 'already_voted';
  end if;
  return 'voted';
end;
$$;

revoke all on function public.cast_vote(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.cast_vote(uuid, text, text, integer) to service_role;
