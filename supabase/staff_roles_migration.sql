-- ============================================================================
-- WECHSEL. — Staff-Rollen (Migration)
-- ----------------------------------------------------------------------------
-- Separat NACH schema.sql (und optional nach admin_migration.sql) ausführen
-- (im SQL Editor -> New query -> Run). schema.sql selbst NICHT erneut
-- ausführen.
--
-- Erweitert die erlaubten Werte für profiles.role um 'staff' (Trainer,
-- Funktionär, Physio, Masseur). Der genaue Untertyp wird im flexiblen
-- "data"-jsonb-Feld unter "staffType" gespeichert, dafür ist keine weitere
-- Schema-Änderung nötig.
-- ============================================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('player', 'club', 'staff'));
