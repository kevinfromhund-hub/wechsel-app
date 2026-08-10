import { supabase } from '../supabaseClient';

/* ============================================================================
   Datenzugriffs-Schicht. Kapselt alle Supabase-Aufrufe, damit die
   UI-Komponenten in App.jsx nicht direkt mit der Datenbank sprechen müssen.
   "profiles.data" (jsonb) wird hier in ein flaches Objekt {id, role, ...}
   umgewandelt, damit die bestehenden Komponenten (Avatar, DiscoverCard, ...)
   unverändert weiterverwendet werden können.
============================================================================ */

function fromRow(row) {
  return { id: row.id, role: row.role, ...row.data };
}

export async function getMyProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return fromRow(data);
}

export async function upsertProfile(userId, role, fields) {
  const { error } = await supabase.from('profiles').upsert({ id: userId, role, data: fields });
  if (error) throw error;
  return { id: userId, role, ...fields };
}

export async function deleteMyProfile(userId) {
  await supabase.from('profiles').delete().eq('id', userId);
}

export async function listCandidates(roles, excludeIds) {
  const roleList = Array.isArray(roles) ? roles : [roles];
  const { data, error } = await supabase.from('profiles').select('*').in('role', roleList);
  if (error) return [];
  const exclude = new Set(excludeIds);
  return data.filter(r => !exclude.has(r.id)).map(fromRow);
}

export async function listMyLikes(myId) {
  const { data, error } = await supabase.from('likes').select('liked_id').eq('liker_id', myId);
  if (error) return [];
  return data.map(r => r.liked_id);
}

export async function listMyPasses(myId) {
  const { data, error } = await supabase.from('passes').select('passed_id').eq('user_id', myId);
  if (error) return [];
  return data.map(r => r.passed_id);
}

export async function likeUser(myId, targetId) {
  const { error } = await supabase.from('likes').insert({ liker_id: myId, liked_id: targetId });
  // 23505 = unique_violation (bereits geliked) -> kein echter Fehler
  if (error && error.code !== '23505') throw error;
}

export async function passUser(myId, targetId) {
  const { error } = await supabase.from('passes').insert({ user_id: myId, passed_id: targetId });
  if (error && error.code !== '23505') throw error;
}

/* Prüft nach einem Like, ob (durch den serverseitigen Trigger) bereits ein
   Match zwischen den beiden entstanden ist, und liefert dessen ID zurück. */
export async function findMatchId(myId, targetId) {
  const { data, error } = await supabase
    .from('matches')
    .select('id')
    .or(`and(user_a.eq.${myId},user_b.eq.${targetId}),and(user_a.eq.${targetId},user_b.eq.${myId})`)
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}

/* Liefert alle Matches der eigenen Person inkl. der Profildaten der
   jeweiligen Gegenseite: [{ matchId, profile }] */
export async function listMyMatches(myId) {
  const { data: matchRows, error } = await supabase
    .from('matches')
    .select('id, user_a, user_b')
    .or(`user_a.eq.${myId},user_b.eq.${myId}`);
  if (error || !matchRows?.length) return [];
  const partnerIds = matchRows.map(m => (m.user_a === myId ? m.user_b : m.user_a));
  const { data: profileRows } = await supabase.from('profiles').select('*').in('id', partnerIds);
  const profileById = new Map((profileRows || []).map(r => [r.id, fromRow(r)]));
  return matchRows
    .map(m => ({
      matchId: m.id,
      profile: profileById.get(m.user_a === myId ? m.user_b : m.user_a),
    }))
    .filter(m => m.profile);
}

export async function getMessages(matchId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data;
}

export async function sendMessage(matchId, senderId, text) {
  const { error } = await supabase.from('messages').insert({ match_id: matchId, sender_id: senderId, text });
  if (error) throw error;
}

/* Abonniert neue Nachrichten eines Matches in Echtzeit. Gibt eine
   Aufräum-Funktion zurück, die beim Verlassen des Chats aufgerufen wird. */
export function subscribeMessages(matchId, onInsert) {
  const channel = supabase
    .channel('messages-' + matchId)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
      (payload) => onInsert(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/* ---------------------------- Admin (nur für ADMIN_EMAILS, siehe App.jsx) ----------------------------
   Der eigentliche Zugriffsschutz läuft über die Datenbank (RLS-Policies und
   is_admin()-Check in admin_list_users(), siehe supabase/admin_migration.sql).
   Diese Funktionen liefern für alle anderen Accounts einen leeren/Fehler-
   Response, egal was das Frontend anzeigt. */

export async function adminListUsers() {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw error;
  return data;
}

export async function adminListAllProfiles() {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) throw error;
  return data.map(fromRow);
}

export async function adminListAllLikes() {
  const { data, error } = await supabase.from('likes').select('*');
  if (error) throw error;
  return data;
}

export async function adminListAllPasses() {
  const { data, error } = await supabase.from('passes').select('*');
  if (error) throw error;
  return data;
}

export async function adminListAllMatches() {
  const { data, error } = await supabase.from('matches').select('*');
  if (error) throw error;
  return data;
}

export async function adminListAllMessages() {
  const { data, error } = await supabase.from('messages').select('*');
  if (error) throw error;
  return data;
}

/* ---------------------------- Auth (Magic Link, kein Passwort) ---------------------------- */

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
