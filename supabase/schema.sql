-- ============================================================================
-- WECHSEL. — Datenbankschema für Supabase
-- ----------------------------------------------------------------------------
-- Anleitung: Im Supabase-Dashboard unter "SQL Editor" -> "New query" komplett
-- einfügen und ausführen. Danach unter "Database" -> "Replication" prüfen,
-- dass "messages" für Realtime aktiviert ist (wird unten auch automatisch
-- versucht).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Profile (Spieler & Vereine). Rollenspezifische Felder liegen in "data"
-- (jsonb), damit das Schema nicht bei jeder neuen Profil-Eigenschaft
-- geändert werden muss.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('player', 'club')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_all_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- Likes ("Interesse"). Lesbar für alle (nötig, damit der Match-Trigger und
-- die Gegenseite ein gegenseitiges Like erkennen können), schreibbar nur für
-- die eigene Person.
-- ----------------------------------------------------------------------------
create table if not exists public.likes (
  liker_id uuid not null references public.profiles(id) on delete cascade,
  liked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (liker_id, liked_id)
);

alter table public.likes enable row level security;

create policy "likes_select_all_authenticated"
  on public.likes for select
  to authenticated
  using (true);

create policy "likes_insert_own"
  on public.likes for insert
  to authenticated
  with check (auth.uid() = liker_id);

-- ----------------------------------------------------------------------------
-- Passes ("Kein Interesse"). Rein persönlich, nur für die eigene Person
-- les- und schreibbar.
-- ----------------------------------------------------------------------------
create table if not exists public.passes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  passed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, passed_id)
);

alter table public.passes enable row level security;

create policy "passes_select_own"
  on public.passes for select
  to authenticated
  using (auth.uid() = user_id);

create policy "passes_insert_own"
  on public.passes for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Matches. Werden AUSSCHLIESSLICH serverseitig per Trigger erzeugt (siehe
-- unten) – kein Client darf direkt einen Match-Datensatz anlegen. Das
-- verhindert, dass jemand sich selbst ein Match "fälscht".
-- ----------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a, user_b)
);

alter table public.matches enable row level security;

create policy "matches_select_participants"
  on public.matches for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

-- ----------------------------------------------------------------------------
-- Chat-Nachrichten. Nur Beteiligte eines Matches dürfen lesen/schreiben.
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "messages_select_participants"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );

create policy "messages_insert_participants"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- Automatisches Matching: Sobald ein gegenseitiges Like existiert
-- (A likt B, und B hat A bereits geliked), wird serverseitig ein Match
-- angelegt. "security definer" lässt die Funktion mit erhöhten Rechten
-- laufen, damit der INSERT in "matches" trotz fehlender Client-Insert-Policy
-- funktioniert.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.likes
    where liker_id = new.liked_id and liked_id = new.liker_id
  ) then
    insert into public.matches (user_a, user_b)
    values (least(new.liker_id, new.liked_id), greatest(new.liker_id, new.liked_id))
    on conflict (user_a, user_b) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_like_created on public.likes;
create trigger on_like_created
  after insert on public.likes
  for each row execute function public.handle_new_like();

-- ----------------------------------------------------------------------------
-- Realtime für den Chat aktivieren (falls die Publication schon existiert,
-- ignoriert Supabase den Fehler bei bereits enthaltener Tabelle nicht immer –
-- im Zweifel im Dashboard unter Database -> Replication manuell aktivieren).
-- ----------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then
  null;
end $$;
