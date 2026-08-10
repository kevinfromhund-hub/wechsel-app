-- ============================================================================
-- WECHSEL. — Mehrere Profile pro Konto (Migration)
-- ----------------------------------------------------------------------------
-- Separat NACH schema.sql (und den anderen Migrationen) ausführen. schema.sql
-- selbst NICHT erneut ausführen.
--
-- Bisher war profiles.id direkt die Auth-User-ID (1 Profil pro Konto möglich).
-- Diese Migration entkoppelt beides: profiles.id bleibt ein eigener Primary
-- Key, eine neue Spalte user_id verknüpft beliebig viele Profile mit einem
-- Auth-Konto (z. B. ein Spieler- UND ein Trainer-Profil derselben Person).
-- ============================================================================

alter table public.profiles add column if not exists user_id uuid;
update public.profiles set user_id = id where user_id is null;
alter table public.profiles alter column user_id set not null;

do $$
begin
  alter table public.profiles add constraint profiles_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
exception when duplicate_object then
  null;
end $$;

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();

-- ----------------------------------------------------------------------------
-- RLS-Policies: "eigene" Zeilen jetzt über user_id statt id prüfen, damit
-- eine Person mehrere Profile anlegen/ändern/löschen darf.
-- ----------------------------------------------------------------------------
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = user_id);

-- profiles_select_all_authenticated (using true) ist unverändert gültig.

-- ----------------------------------------------------------------------------
-- admin_list_users() neu fassen: der bisherige Join "p.id = u.id" gilt nicht
-- mehr (mehrere Profile pro User). Rollen-Info kommt im Admin-Screen jetzt
-- direkt aus adminListAllProfiles() (gejoint über user_id), diese Funktion
-- liefert nur noch die reinen Auth-Konten.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_list_users();

create function public.admin_list_users()
returns table (id uuid, email text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select u.id, u.email, u.created_at
    from auth.users u
    order by u.created_at desc;
end;
$$;

-- DROP FUNCTION entfernt auch alle zuvor erteilten Rechte (anders als
-- CREATE OR REPLACE) - daher muss authenticated hier erneut Ausführrechte
-- bekommen, sonst schlägt der RPC-Aufruf aus der App mit "permission
-- denied" fehl (zeigt sich dort als "Zugriff verweigert").
grant execute on function public.admin_list_users() to authenticated;
