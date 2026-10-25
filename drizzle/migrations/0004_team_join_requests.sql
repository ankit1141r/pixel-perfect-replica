-- Team join requests table and admin approval workflow
create table if not exists public.team_join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  status public.registration_status not null default 'pending',
  message text check (char_length(message) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, player_id)
);

create index if not exists team_join_requests_team_idx on public.team_join_requests(team_id);
create index if not exists team_join_requests_player_idx on public.team_join_requests(player_id);
create index if not exists team_join_requests_status_idx on public.team_join_requests(status);

grant select, insert, update, delete on public.team_join_requests to authenticated;
grant all on public.team_join_requests to service_role;
alter table public.team_join_requests enable row level security;

-- Policies
drop policy if exists "Users read own requests, admins read all" on public.team_join_requests;
create policy "Users read own requests, admins read all" on public.team_join_requests for select to authenticated
  using (player_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "Players can submit join requests" on public.team_join_requests;
create policy "Players can submit join requests" on public.team_join_requests for insert to authenticated
  with check (player_id = auth.uid() and status = 'pending');

drop policy if exists "Admins update join requests" on public.team_join_requests;
create policy "Admins update join requests" on public.team_join_requests for update to authenticated
  using (public.has_role(auth.uid(), 'admin') or player_id = auth.uid())
  with check (public.has_role(auth.uid(), 'admin') or player_id = auth.uid());

drop policy if exists "Players or admins delete join requests" on public.team_join_requests;
create policy "Players or admins delete join requests" on public.team_join_requests for delete to authenticated
  using (player_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- RPC for admin approval: adds player to team_members and sets status = 'approved'
create or replace function public.approve_team_join_request(_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  _team_id uuid;
  _player_id uuid;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only administrators can approve join requests' using errcode = '42501';
  end if;

  select team_id, player_id into _team_id, _player_id
  from public.team_join_requests
  where id = _request_id;

  if not found then
    raise exception 'Join request not found';
  end if;

  insert into public.team_members (team_id, player_id)
  values (_team_id, _player_id)
  on conflict (team_id, player_id) do nothing;

  update public.team_join_requests
  set status = 'approved', updated_at = now()
  where id = _request_id;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id)
  values (auth.uid(), 'Approved team join request', 'team_join_requests', _request_id);
end $$;

revoke execute on function public.approve_team_join_request(uuid) from public, anon;
grant execute on function public.approve_team_join_request(uuid) to authenticated;

-- RPC for admin rejection
create or replace function public.reject_team_join_request(_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only administrators can reject join requests' using errcode = '42501';
  end if;

  update public.team_join_requests
  set status = 'rejected', updated_at = now()
  where id = _request_id;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id)
  values (auth.uid(), 'Rejected team join request', 'team_join_requests', _request_id);
end $$;

revoke execute on function public.reject_team_join_request(uuid) from public, anon;
grant execute on function public.reject_team_join_request(uuid) to authenticated;

drop trigger if exists team_join_requests_activity on public.team_join_requests;
create trigger team_join_requests_activity
  after insert or update on public.team_join_requests
  for each row execute function public.log_activity();
