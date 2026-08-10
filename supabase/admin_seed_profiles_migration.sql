-- ============================================================================
-- WECHSEL. — Admin-Testprofile (Migration)
-- ----------------------------------------------------------------------------
-- Separat NACH den bisherigen Migrationen ausführen.
--
-- Erlaubt Admin-Accounts (siehe is_admin() in admin_migration.sql), Profile
-- anzulegen/zu bearbeiten/zu löschen, die an KEIN echtes Konto gebunden sind
-- (user_id = null) - praktisch zum Anlegen realistischer Testdaten
-- (Test-Vereine, -Spieler, -Physios) ohne echte Registrierung. Reguläre
-- Nutzer:innen bleiben weiterhin strikt auf ihre eigenen Profile beschränkt.
-- ============================================================================

alter table public.profiles alter column user_id drop not null;

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = user_id or public.is_admin());
