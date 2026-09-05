-- Run this migration in the Supabase SQL Editor.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_email text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_email)
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;
end;
$$;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

drop policy if exists "Members can view their groups" on public.groups;
create policy "Members can view their groups"
  on public.groups for select
  using (exists (
    select 1 from public.group_members member
    where member.group_id = groups.id
      and lower(member.user_email) = lower(auth.jwt() ->> 'email')
  ));

drop policy if exists "Members can view group membership" on public.group_members;
create policy "Members can view group membership"
  on public.group_members for select
  using (lower(user_email) = lower(auth.jwt() ->> 'email'));

create or replace function public.create_group_chat(p_name text, p_members text[])
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  created_group public.groups;
  current_email text := lower(auth.jwt() ->> 'email');
begin
  if current_email is null or current_email = '' then
    raise exception 'You must be logged in to create a group';
  end if;

  insert into public.groups (name)
  values (trim(p_name))
  returning * into created_group;

  insert into public.group_members (group_id, user_email)
  values (created_group.id, current_email)
  on conflict do nothing;

  insert into public.group_members (group_id, user_email)
  select created_group.id, lower(trim(member_email))
  from unnest(coalesce(p_members, array[]::text[])) as member_email
  where trim(member_email) <> ''
  on conflict do nothing;

  return created_group;
end;
$$;

create or replace function public.get_my_groups()
returns table (
  group_id uuid,
  group_name text,
  group_created_at timestamptz,
  members text[]
)
language sql
security definer
set search_path = public
as $$
  select g.id, g.name, g.created_at, array_agg(all_members.user_email order by all_members.user_email)
  from public.groups g
  join public.group_members viewer on viewer.group_id = g.id
  join public.group_members all_members on all_members.group_id = g.id
  where lower(viewer.user_email) = lower(auth.jwt() ->> 'email')
  group by g.id, g.name, g.created_at
  order by g.created_at desc;
$$;