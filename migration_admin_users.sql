-- Secure admin-only user directory.
-- Run this migration in the Supabase SQL editor before using the Admin Users panel.

create or replace function public.get_all_users_admin()
returns table (
  id uuid,
  email text,
  display_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.id,
    u.email,
    coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)) as display_name,
    u.created_at
  from auth.users as u
  where lower((auth.jwt() ->> 'email')) = 'karlnicko2019@gmail.com'
  order by u.created_at desc;
$$;

revoke all on function public.get_all_users_admin() from public;
grant execute on function public.get_all_users_admin() to authenticated;
