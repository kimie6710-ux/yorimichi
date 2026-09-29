-- YORUMICHI Supabase schema
-- Run in Supabase SQL Editor (or `supabase db push` with this as a migration).
-- Requires: Authentication → Providers → Anonymous sign-ins = ON

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- users: public profile mirror of auth.users
-- ─────────────────────────────────────────────
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  is_anonymous boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, is_anonymous)
  values (new.id, coalesce(new.is_anonymous, true))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ─────────────────────────────────────────────
-- searches: one row per 「この街をずらす」
-- ─────────────────────────────────────────────
create table if not exists public.searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  query text not null check (char_length(query) between 1 and 80),
  latitude double precision not null,
  longitude double precision not null,
  mode text not null default 'ai' check (mode in ('ai', 'fallback', 'mock')),
  created_at timestamptz not null default now()
);
create index if not exists searches_user_created_idx on public.searches (user_id, created_at desc);

-- ─────────────────────────────────────────────
-- recommendations: what the AI said about each real place
-- ─────────────────────────────────────────────
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.searches (id) on delete cascade,
  place_id text not null,
  real_name text not null,
  ai_title text not null,
  interpretation text not null,
  why text not null,
  kind text not null default 'shifted' check (kind in ('literal', 'shifted')),
  interpretation_axis text,
  surprise_score smallint not null check (surprise_score between 1 and 5),
  confidence real not null check (confidence between 0 and 1),
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);
create index if not exists recommendations_search_idx on public.recommendations (search_id);

-- ─────────────────────────────────────────────
-- visits: 「実際どうだった？」
-- ─────────────────────────────────────────────
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  place_id text not null,
  recommendation_id uuid references public.recommendations (id) on delete set null,
  reaction text not null check (reaction in ('totally_off', 'kind_of', 'totally_get_it')),
  created_at timestamptz not null default now()
);
create index if not exists visits_user_created_idx on public.visits (user_id, created_at desc);

-- ─────────────────────────────────────────────
-- stickers: 街のかけら
-- One row per cut-out sticker. Several stickers can share one photo.
-- photo_url  = original photo path, sticker_url = transparent PNG path
-- (both are Storage object paths, signed on read).
-- Google Places content (reviews etc.) is NOT stored — only place_id + what
-- the user created.
-- ─────────────────────────────────────────────
create table if not exists public.stickers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  place_id text not null,
  recommendation_id uuid references public.recommendations (id) on delete set null,
  real_name text not null,
  ai_title text not null,
  query text not null default '',
  reaction text check (reaction in ('totally_off', 'kind_of', 'totally_get_it')),
  rotation real not null default 0,
  photo_url text,
  sticker_url text,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  created_at timestamptz not null default now()
);
create index if not exists stickers_user_created_idx on public.stickers (user_id, created_at desc);
create index if not exists stickers_place_idx on public.stickers (user_id, place_id);

-- ─────────────────────────────────────────────
-- Row Level Security: every row belongs to exactly one (anonymous) user.
-- ─────────────────────────────────────────────
alter table public.users enable row level security;
alter table public.searches enable row level security;
alter table public.recommendations enable row level security;
alter table public.visits enable row level security;
alter table public.stickers enable row level security;

drop policy if exists "users: self read" on public.users;
create policy "users: self read" on public.users
  for select using (id = auth.uid());

drop policy if exists "searches: own" on public.searches;
create policy "searches: own" on public.searches
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "recommendations: via own search" on public.recommendations;
create policy "recommendations: via own search" on public.recommendations
  for all
  using (exists (select 1 from public.searches s where s.id = search_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.searches s where s.id = search_id and s.user_id = auth.uid()));

drop policy if exists "visits: own" on public.visits;
create policy "visits: own" on public.visits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "stickers: own" on public.stickers;
create policy "stickers: own" on public.stickers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- Storage: private bucket, objects live under "{auth.uid()}/..."
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stickers', 'stickers', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "stickers: own read" on storage.objects;
create policy "stickers: own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'stickers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "stickers: own insert" on storage.objects;
create policy "stickers: own insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'stickers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "stickers: own delete" on storage.objects;
create policy "stickers: own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'stickers' and (storage.foldername(name))[1] = auth.uid()::text);
