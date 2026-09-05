-- Run this migration in the Supabase SQL Editor.

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_email text not null,
  to_email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  constraint friend_requests_distinct_users check (lower(from_email) <> lower(to_email)),
  constraint friend_requests_unique_pending unique (from_email, to_email, status)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  friend_email text not null,
  friend_name text,
  created_at timestamptz not null default now(),
  constraint friendships_distinct_users check (lower(user_email) <> lower(friend_email)),
  constraint friendships_unique_pair unique (user_email, friend_email)
);

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "Users can view their friend requests" on public.friend_requests;
drop policy if exists "Users can send friend requests" on public.friend_requests;
drop policy if exists "Recipients can update friend requests" on public.friend_requests;
drop policy if exists "Users can view their friendships" on public.friendships;

create policy "Users can view their friend requests"
  on public.friend_requests for select
  using (lower(auth.jwt() ->> 'email') in (lower(from_email), lower(to_email)));

create policy "Users can send friend requests"
  on public.friend_requests for insert
  with check (lower(auth.jwt() ->> 'email') = lower(from_email));

create policy "Recipients can update friend requests"
  on public.friend_requests for update
  using (lower(auth.jwt() ->> 'email') = lower(to_email))
  with check (lower(auth.jwt() ->> 'email') = lower(to_email));

create policy "Users can view their friendships"
  on public.friendships for select
  using (lower(auth.jwt() ->> 'email') = lower(user_email));

create or replace function public.create_friendship_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    insert into public.friendships (user_email, friend_email, friend_name)
    values
      (lower(new.from_email), lower(new.to_email), split_part(new.to_email, '@', 1)),
      (lower(new.to_email), lower(new.from_email), split_part(new.from_email, '@', 1))
    on conflict (user_email, friend_email) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists friend_request_accepted on public.friend_requests;
create trigger friend_request_accepted
  after update of status on public.friend_requests
  for each row execute function public.create_friendship_rows();