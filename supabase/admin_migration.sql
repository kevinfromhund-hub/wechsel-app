-- ============================================================================
-- WECHSEL. — Admin-Zugriff (Migration)
-- ----------------------------------------------------------------------------
-- Separat NACH schema.sql ausführen (im SQL Editor -> New query -> Run).
-- schema.sql selbst NICHT erneut ausführen, sonst gibt es Fehler wegen
-- bereits existierender Policies.
--
-- Ergibt: dein Admin-Account (siehe ADMIN_EMAILS unten) kann in der App unter
-- dem neuen "Admin"-Tab alle registrierten Nutzer:innen, Profile, Likes,
-- Matches und Nachrichten lesen (rein lesend). Für alle anderen Accounts
-- ändert sich nichts an den bisherigen Zugriffsregeln.
--
-- Weitere Admin-E-Mails: im Array bei is_admin() unten einfach ergänzen,
-- z. B. array['kevin.fromhund@hotmail.com', 'zweite@email.at'].
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.email() = any(array['kevin.fromhund@hotmail.com', 'darckandy.sport@gmail.com']::text[]);
$$;

-- profiles sind bereits für alle authentifizierten Nutzer:innen lesbar
-- (siehe schema.sql, "profiles_select_all_authenticated") - dafür braucht
-- es keine zusätzliche Admin-Policy.

drop policy if exists "admin_select_all_likes" on public.likes;
create policy "admin_select_all_likes"
  on public.likes for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admin_select_all_passes" on public.passes;
create policy "admin_select_all_passes"
  on public.passes for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admin_select_all_matches" on public.matches;
create policy "admin_select_all_matches"
  on public.matches for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admin_select_all_messages" on public.messages;
create policy "admin_select_all_messages"
  on public.messages for select
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- Liefert alle registrierten Auth-Nutzer:innen (inkl. E-Mail und Datum), auch
-- die, die sich zwar per Magic-Link angemeldet, aber noch kein Profil
-- angelegt haben. "auth.users" ist normalerweise nicht über die Client-API
-- lesbar - diese Funktion läuft mit erhöhten Rechten ("security definer"),
-- prüft aber selbst zuerst is_admin(), bevor sie irgendetwas zurückgibt.
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (id uuid, email text, created_at timestamptz, role text)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select u.id, u.email, u.created_at, p.role
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;
