-- よるみち / YORUMICHI — Supabase schema
-- Run in the Supabase SQL Editor (or `supabase db push` with this as a migration).
-- Requires: Authentication → Providers → Anonymous sign-ins = ON
--
-- Access model
--   The browser signs in anonymously and only ever calls our API routes.
--   The API routes verify the caller's token, apply the rules (ownership,
--   "only on site", daily limits) and write with the service-role key, because
--   placing / sending stickers crosses users. RLS below still lets a signed-in
--   user read their own rows directly, and nothing else.

create extension if not exists "pgcrypto";

-- Old tables from the search-based version (no longer used).
drop table if exists public.recommendations cascade;
drop table if exists public.searches cascade;
drop table if exists public.visits cascade;
drop table if exists public.stickers cascade;

-- ─────────────────────────────────────────────
-- users: one per anonymous auth user
-- ─────────────────────────────────────────────
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  area_key text,                               -- ~5km cell, to prefer "another area" when sending
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.users add column if not exists area_key text;
alter table public.users add column if not exists last_active_at timestamptz not null default now();
alter table public.users drop column if exists is_anonymous;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ─────────────────────────────────────────────
-- spots: a real Google place + the よるみち layer (the AI's first line)
-- Only the minimum from Places is kept (name, position, category, one photo ref).
-- ─────────────────────────────────────────────
create table if not exists public.spots (
  id text primary key,                         -- Google place id
  name text not null,
  lat double precision not null,
  lng double precision not null,
  category text,
  types text[] not null default '{}',
  photo_name text,
  address text,
  ai_copy text,
  ai_copy_form text,
  ai_bird_line text,
  ai_model text,
  ai_generated_at timestamptz,
  area_key text not null,
  created_at timestamptz not null default now()
);
create index if not exists spots_area_idx on public.spots (area_key);

-- ─────────────────────────────────────────────
-- visits: "着いた"
-- ─────────────────────────────────────────────
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  spot_id text not null references public.spots (id) on delete cascade,
  method text not null check (method in ('gps', 'manual')),
  created_at timestamptz not null default now()
);
create index visits_user_idx on public.visits (user_id, created_at desc);
create index visits_spot_idx on public.visits (spot_id);

-- ─────────────────────────────────────────────
-- spot_saves: 気になる
-- ─────────────────────────────────────────────
create table if not exists public.spot_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  spot_id text not null references public.spots (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, spot_id)
);

-- ─────────────────────────────────────────────
-- observations: what someone looked at (the original photo stays private)
-- ─────────────────────────────────────────────
create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  spot_id text not null references public.spots (id) on delete cascade,
  photo_path text,
  label text not null,
  memo text not null default '',
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- stickers: Spot × Observation × Photo
-- A received sticker is the receiver's own copy (origin = 'received'),
-- pointing at the same image file.
-- ─────────────────────────────────────────────
create table public.stickers (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid references public.observations (id) on delete set null,
  spot_id text not null references public.spots (id) on delete cascade,
  owner_id uuid not null references public.users (id) on delete cascade,
  creator_id uuid not null references public.users (id) on delete cascade,
  image_path text not null,
  rotation real not null default 0,
  label text not null check (char_length(label) between 1 and 20),
  memo text not null default '' check (char_length(memo) <= 80),
  origin text not null check (origin in ('found', 'received')),
  status text not null default 'kept' check (status in ('kept', 'placed', 'sent')),
  placed_at timestamptz,
  source_sticker_id uuid references public.stickers (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stickers_owner_idx on public.stickers (owner_id, created_at desc);
create index stickers_spot_idx on public.stickers (spot_id, status);

-- ─────────────────────────────────────────────
-- sticker_transfers: 知らない誰かへ（kind = 'return' は送り主へのお返し）
-- ─────────────────────────────────────────────
create table if not exists public.sticker_transfers (
  id uuid primary key default gen_random_uuid(),
  sticker_id uuid not null references public.stickers (id) on delete cascade,
  copy_id uuid references public.stickers (id) on delete set null,
  sender_id uuid not null references public.users (id) on delete cascade,
  receiver_id uuid references public.users (id) on delete cascade,
  kind text not null check (kind in ('send', 'return')),
  status text not null check (status in ('pending', 'delivered', 'opened')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  opened_at timestamptz
);
create index if not exists transfers_receiver_idx on public.sticker_transfers (receiver_id, delivered_at desc);
create index if not exists transfers_pending_idx on public.sticker_transfers (status) where status = 'pending';

-- ─────────────────────────────────────────────
-- sticker_views: "your sticker was seen" (one row per person)
-- ─────────────────────────────────────────────
create table if not exists public.sticker_views (
  id uuid primary key default gen_random_uuid(),
  sticker_id uuid not null references public.stickers (id) on delete cascade,
  viewer_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (sticker_id, viewer_id)
);

-- ─────────────────────────────────────────────
-- Row Level Security (direct reads only; all writes go through the API)
-- ─────────────────────────────────────────────
alter table public.users enable row level security;
alter table public.spots enable row level security;
alter table public.visits enable row level security;
alter table public.spot_saves enable row level security;
alter table public.observations enable row level security;
alter table public.stickers enable row level security;
alter table public.sticker_transfers enable row level security;
alter table public.sticker_views enable row level security;

drop policy if exists "users: self" on public.users;
create policy "users: self" on public.users for select using (id = auth.uid());
drop policy if exists "spots: anyone" on public.spots;
create policy "spots: anyone" on public.spots for select using (true);
drop policy if exists "visits: own" on public.visits;
create policy "visits: own" on public.visits for select using (user_id = auth.uid());
drop policy if exists "saves: own" on public.spot_saves;
create policy "saves: own" on public.spot_saves for select using (user_id = auth.uid());
drop policy if exists "observations: own" on public.observations;
create policy "observations: own" on public.observations for select using (user_id = auth.uid());
drop policy if exists "stickers: own" on public.stickers;
create policy "stickers: own" on public.stickers for select using (owner_id = auth.uid());
drop policy if exists "transfers: mine" on public.sticker_transfers;
create policy "transfers: mine" on public.sticker_transfers for select using (receiver_id = auth.uid() or sender_id = auth.uid());

-- ─────────────────────────────────────────────
-- Storage: private bucket; files are served through signed URLs
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stickers', 'stickers', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
