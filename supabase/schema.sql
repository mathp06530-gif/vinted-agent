-- Vinted Agent : à coller UNE fois dans Supabase → SQL Editor → Run.
-- Crée les tables, le stockage des photos, et verrouille tout pour que
-- chaque compte ne voie que ses propres annonces.

create table if not exists public.listings (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'brouillon' check (status in ('brouillon','prete','publiee','vendue')),
  title text default '', description text default '',
  brand text default '', model text default '', category text default '',
  size text default '', condition text default '', color text default '', material text default '',
  price numeric, price_min numeric, price_max numeric,
  hashtags text default '', hints text default '', ai_notes text default '',
  vinted_url text default '',
  photos jsonb not null default '[]'::jsonb,   -- chemins des photos dans le stockage, dans l'ordre
  published_at timestamptz, sold_at timestamptz
);
create index if not exists listings_user_updated on public.listings (user_id, updated_at desc);

create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb
);

alter table public.listings enable row level security;
alter table public.settings enable row level security;

drop policy if exists "mes annonces" on public.listings;
create policy "mes annonces" on public.listings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "mes reglages" on public.settings;
create policy "mes reglages" on public.settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Stockage privé des photos : dossier = identifiant du compte
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "mes photos" on storage.objects;
create policy "mes photos" on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- v2 : authenticité (onglet « Douteuses » + verdicts qui servent d'exemples à l'agent)
alter table public.listings add column if not exists authenticity text not null default '';
alter table public.listings add column if not exists auth_reason text not null default '';
