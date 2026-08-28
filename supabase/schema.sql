-- Initiative Table — run once in the Supabase SQL Editor (Dashboard → SQL).
-- Creates the per-user blob table. Row Level Security means user A cannot
-- read or write user B. The browser uses the public anon key; these policies
-- are the lock.

create table if not exists public.user_blobs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  store jsonb not null default '{}'::jsonb,
  homebrew_creatures jsonb not null default '[]'::jsonb,
  homebrew_spells jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_blobs enable row level security;

drop policy if exists "user_blobs_select_own" on public.user_blobs;
create policy "user_blobs_select_own"
  on public.user_blobs for select
  using (auth.uid() = user_id);

drop policy if exists "user_blobs_insert_own" on public.user_blobs;
create policy "user_blobs_insert_own"
  on public.user_blobs for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_blobs_update_own" on public.user_blobs;
create policy "user_blobs_update_own"
  on public.user_blobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
