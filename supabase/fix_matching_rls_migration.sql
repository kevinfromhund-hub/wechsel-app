-- ============================================================================
-- WECHSEL. — Fix: Matching/Chat-Policies nach Mehrfach-Profil-Umstellung
-- ----------------------------------------------------------------------------
-- Separat NACH den bisherigen Migrationen ausführen.
--
-- Bug: likes/passes/matches/messages-Policies prüften bisher direkt
-- "auth.uid() = <profil-spalte>". Das stimmte nur, solange profiles.id
-- identisch mit der Auth-User-ID war (Zustand vor multi_profile_migration.sql).
-- Seit profiles.id ein eigener, unabhängiger Wert ist (verknüpft über
-- profiles.user_id), schlägt dieser Vergleich für JEDES neu angelegte Profil
-- fehl (über "+ Weiteres Profil hinzufügen" oder Admin-Testprofile) - Liken,
-- Passen und Matchen funktionierte für diese Profile dadurch gar nicht mehr.
-- Fix: Eigentümerschaft über einen Join auf profiles.user_id prüfen statt
-- direkt gegen die Profil-ID zu vergleichen.
-- ============================================================================

drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own"
  on public.likes for insert
  to authenticated
  with check (exists (
    select 1 from public.profiles p where p.id = liker_id and p.user_id = auth.uid()
  ));

drop policy if exists "passes_select_own" on public.passes;
create policy "passes_select_own"
  on public.passes for select
  to authenticated
  using (exists (
    select 1 from public.profiles p where p.id = passes.user_id and p.user_id = auth.uid()
  ));

drop policy if exists "passes_insert_own" on public.passes;
create policy "passes_insert_own"
  on public.passes for insert
  to authenticated
  with check (exists (
    select 1 from public.profiles p where p.id = passes.user_id and p.user_id = auth.uid()
  ));

drop policy if exists "matches_select_participants" on public.matches;
create policy "matches_select_participants"
  on public.matches for select
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and (p.id = matches.user_a or p.id = matches.user_b)
  ));

drop policy if exists "messages_select_participants" on public.messages;
create policy "messages_select_participants"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.matches m
      join public.profiles p on p.user_id = auth.uid() and (p.id = m.user_a or p.id = m.user_b)
      where m.id = messages.match_id
    )
  );

drop policy if exists "messages_insert_participants" on public.messages;
create policy "messages_insert_participants"
  on public.messages for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = sender_id and p.user_id = auth.uid())
    and exists (
      select 1 from public.matches m
      join public.profiles p on p.user_id = auth.uid() and (p.id = m.user_a or p.id = m.user_b)
      where m.id = messages.match_id
    )
  );
