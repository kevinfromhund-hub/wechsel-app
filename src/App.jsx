import React, { useState, useEffect, useRef } from 'react';
import { Heart, X, MessageCircle, User, Lock, MapPin, RotateCcw, Send, ChevronLeft, ShieldCheck, Sparkles, Search, Users, Euro, LocateFixed, GraduationCap, ExternalLink, Mail, ShieldAlert, Award, Briefcase, Stethoscope, ChevronDown, Plus, LogOut, ArrowRight } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import {
  listMyProfiles, createProfile, updateProfile, deleteProfile, listCandidates, listMyLikes, listMyPasses,
  likeUser, passUser, findMatchId, listMyMatches, getMessages, sendMessage, subscribeMessages,
  signUpWithPassword, signInWithPassword, signOut,
  adminListUsers, adminListAllProfiles, adminListAllLikes, adminListAllMatches, adminListAllMessages, adminCreateProfile,
} from './lib/api';

const ACTIVE_PROFILE_STORAGE_KEY = 'wechsel_active_profile_id';

/* Muss mit is_admin() in supabase/admin_migration.sql übereinstimmen. Rein
   clientseitig nur für die Sichtbarkeit des Admin-Tabs relevant - der
   eigentliche Zugriffsschutz läuft über die Datenbank-Policies. */
const ADMIN_EMAILS = ['kevin.fromhund@hotmail.com'];

/* ============================================================================
   WECHSEL. — Transfer-Matching-App für den Amateurfußball (Österreich)
   ----------------------------------------------------------------------------
   Produktiv-Version mit echtem Backend:
     - Supabase Postgres statt window.storage (siehe supabase/schema.sql)
     - Echtes Login per E-Mail + Passwort (Supabase Auth), einmalige
       Bestätigungsmail bei der Registrierung
     - Matches werden serverseitig per Datenbank-Trigger erzeugt, sobald ein
       gegenseitiges Like existiert (siehe schema.sql: handle_new_like)
     - Chat läuft in Echtzeit über Supabase Realtime

   Fachliche Funktionen unverändert gegenüber dem Prototyp:
     - Geburtsdatum, Beginn Fußballspielen, Pause (>18 Monate), LAZ-/Akademie-
       Zeiträume, Selbstauskunft "keine Ausbildungsentschädigung"
     - Automatische Schätzung der Ausbildungsentschädigung nach ÖFB-Regulativ
       Anhang I (gültig ab 1.5.2025) – SCHÄTZUNG, keine Rechtsauskunft
     - Standort per Live-GPS + Link zu Google Maps, exakte Koordinaten nur im
       eigenen Profil sichtbar, nie auf den anonymen Matching-Karten
     - Datenschutzerklärung mit Zustimmungs-Pflichtfeld, zusätzliche
       Eltern-Zustimmung bei Spieler:innen unter 18

   Zehn lokale Demo-Profile (Spieler & Vereine) werden weiterhin in die
   Entdecken-Ansicht gemischt, damit auch bei wenigen echten Nutzer:innen
   nicht sofort ein leeres Deck erscheint. Sie sind rein clientseitig und
   matchen sofort bei "Interesse" (kein echter Datenbank-Eintrag nötig).
============================================================================ */

/* ---------------------------- Stammdaten: Orte (Österreich) ---------------------------- */

const AUSTRIA_CITY_COORDS = {
  'Wien': [48.2082, 16.3738], 'Graz': [47.0707, 15.4395], 'Linz': [48.3069, 14.2858],
  'Salzburg': [47.8095, 13.0550], 'Innsbruck': [47.2692, 11.4041], 'Klagenfurt': [46.6247, 14.3055],
  'Villach': [46.6111, 13.8558], 'Wels': [48.1575, 14.0289], 'Sankt Pölten': [48.2047, 15.6256],
  'Dornbirn': [47.4125, 9.7417], 'Wiener Neustadt': [47.8121, 16.2437], 'Steyr': [48.0397, 14.4210],
  'Feldkirch': [47.2411, 9.5981], 'Bregenz': [47.5031, 9.7471], 'Leonding': [48.2775, 14.2419],
  'Klosterneuburg': [48.2536, 16.3272], 'Baden': [48.0064, 16.2317], 'Wolfsberg': [46.8397, 14.8447],
  'Leoben': [47.3800, 15.0942], 'Krems an der Donau': [48.4102, 15.6136], 'Traun': [48.2214, 14.2350],
  'Amstetten': [48.1228, 14.8722], 'Kapfenberg': [47.4442, 15.2933], 'Hallein': [47.6833, 13.1000],
  'Kufstein': [47.5847, 12.1625], 'Traiskirchen': [48.0122, 16.2917], 'Schwechat': [48.1394, 16.4700],
  'Braunau am Inn': [48.2578, 13.0397], 'Stockerau': [48.3833, 16.2131], 'Saalfelden': [47.4267, 12.8461],
  'Ried im Innkreis': [48.2114, 13.4894], 'Feldkirchen in Kärnten': [46.7239, 14.0925],
};
const AUSTRIA_CITIES = Object.keys(AUSTRIA_CITY_COORDS);

const POSITIONS = [
  { code: 'TW', label: 'Torwart', x: 50, y: 92 },
  { code: 'IV', label: 'Innenverteidiger', x: 50, y: 78 },
  { code: 'LV', label: 'Linker Verteidiger', x: 18, y: 75 },
  { code: 'RV', label: 'Rechter Verteidiger', x: 82, y: 75 },
  { code: 'DM', label: 'Defensives Mittelfeld', x: 50, y: 60 },
  { code: 'ZM', label: 'Zentrales Mittelfeld', x: 50, y: 48 },
  { code: 'OM', label: 'Offensives Mittelfeld', x: 50, y: 35 },
  { code: 'LM', label: 'Linkes Mittelfeld', x: 15, y: 45 },
  { code: 'RM', label: 'Rechtes Mittelfeld', x: 85, y: 45 },
  { code: 'LA', label: 'Linksaußen', x: 12, y: 22 },
  { code: 'RA', label: 'Rechtsaußen', x: 88, y: 22 },
  { code: 'ST', label: 'Sturm', x: 50, y: 12 },
];
const posByCode = (code) => POSITIONS.find(p => p.code === code);

/* Vereinfachte 7-stufige österreichische Leistungsstufen-Einteilung (Bezeichnungen
   variieren je Landesverband leicht – hier zusammengefasst für Auswahl & Berechnung). */
/* Vereinfachte österreichische Leistungsstufen-Einteilung, angelehnt an die 7
   offiziellen Leistungsstufen des ÖFB-Regulativs (Anhang I). Da es mehr
   gebräuchliche Liga-Namen als offizielle Stufen gibt (Bezeichnungen variieren
   je Landesverband: Gebietsliga/Unterliga/Bezirksliga sind vielerorts
   dieselbe Ebene; 1. und 2. Landesliga liegen meist auf derselben Ebene,
   z. B. als Ost-/West-Gruppen), teilen sich manche Namen dieselbe Stufe –
   das entspricht auch der Realität, dass die 7 Stufen ganz Österreich
   abdecken müssen. Für die Berechnung der Ausbildungsentschädigung zählt
   ausschließlich die Stufe ("level"), nicht der genaue Name. */
const AUSTRIA_LEAGUES = [
  { label: 'Bundesliga', level: 1 },
  { label: '2. Liga', level: 2 },
  { label: 'Regionalliga', level: 3 },
  { label: '1. Landesliga', level: 4 },
  { label: '2. Landesliga', level: 4 },
  { label: 'Gebietsliga / Unterliga / Bezirksliga', level: 5 },
  { label: '1. Klasse', level: 6 },
  { label: '2. Klasse und darunter', level: 7 },
];
const AUSTRIA_LEAGUE_LABELS = AUSTRIA_LEAGUES.map(l => l.label);
function levelForLeague(label) {
  const found = AUSTRIA_LEAGUES.find(l => l.label === label);
  return found ? found.level : 7;
}

const LEAGUES_YOUTH = ['Landesliga (Nachwuchs)', 'Regionalliga (Nachwuchs)', 'ÖFB-Nachwuchsbundesliga'];
const FEET = ['rechts', 'links', 'beidfüßig'];

const TODAY_ISO = new Date().toISOString().slice(0, 10);

/* ---------------------------- Staff-Rollen (Trainer, Funktionär, Physio, Masseur) ---------------------------- */
/* Eigener "staff"-Rollenwert mit Unterfeld "staffType", statt vier separater
   role-Werte - hält die player/club/staff-Verzweigungen in der App
   überschaubar (siehe supabase/staff_roles_migration.sql für die DB-Seite). */

const STAFF_TYPES = [
  { code: 'trainer', label: 'Trainer', icon: Award },
  { code: 'funktionaer', label: 'Funktionär', icon: Briefcase },
  { code: 'physio', label: 'Physio', icon: Stethoscope },
  { code: 'masseur', label: 'Masseur', icon: Stethoscope },
];
const staffTypeByCode = (code) => STAFF_TYPES.find(t => t.code === code);

const TRAINER_LICENSES = ['UEFA Pro Lizenz', 'UEFA A-Lizenz', 'UEFA B-Lizenz', 'ÖFB Torwarttrainer-Lizenz', 'Keine Lizenz / in Ausbildung'];
const TRAINER_ROLES = ['Cheftrainer', 'Co-Trainer', 'Torwarttrainer', 'Nachwuchstrainer', 'Athletiktrainer'];
const FUNKTIONAER_ROLES = ['Obmann/Obfrau', 'Sportlicher Leiter', 'Kassier', 'Schriftführer', 'Pressesprecher', 'Sonstige Funktion'];
const PHYSIO_QUALIFICATIONS = ['Physiotherapeut:in (akademisch)', 'Sportphysiotherapeut:in', 'In Ausbildung'];
const MASSEUR_QUALIFICATIONS = ['Sportmasseur:in', 'Massagetherapeut:in', 'In Ausbildung'];

function staffQualificationOptions(staffType) {
  if (staffType === 'trainer') return TRAINER_ROLES;
  if (staffType === 'funktionaer') return FUNKTIONAER_ROLES;
  if (staffType === 'physio') return PHYSIO_QUALIFICATIONS;
  if (staffType === 'masseur') return MASSEUR_QUALIFICATIONS;
  return [];
}
function staffQualificationLabel(staffType) {
  if (staffType === 'trainer') return 'Gewünschte Trainerrolle';
  if (staffType === 'funktionaer') return 'Funktion';
  return 'Qualifikation';
}

/* ---------------------------- Ausbildungsentschädigung (ÖFB-Regulativ, Anhang I, gültig ab 1.5.2025) ---------------------------- */

const AE_BASE_BY_AGE = { 9: 150, 10: 200, 11: 250, 12: 300, 13: 400, 14: 500, 15: 600, 16: 700, 17: 750, 18: 850, 19: 700, 20: 600, 21: 500, 22: 400, 23: 300 };
const AE_LEVEL_FACTOR = { 1: 1.60, 2: 1.40, 3: 1.20, 4: 1.00, 5: 0.80, 6: 0.60, 7: 0.40 };
const AE_ZERO_REASON_TEXT = {
  self: 'laut Selbstauskunft des Spielers',
  break: 'Pause > 18 Monate (§ 12 Abs. 4 ÖFB-Regulativ)',
  age: '28. Lebensjahr vollendet (§ 10 Abs. 5 ÖFB-Regulativ)',
};

function calcAge(birthDateStr, atDateStr) {
  if (!birthDateStr) return null;
  const b = new Date(birthDateStr);
  const at = atDateStr ? new Date(atDateStr) : new Date();
  let age = at.getFullYear() - b.getFullYear();
  const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) age--;
  return age;
}
function monthsBetween(dateAStr, dateBStr) {
  const a = new Date(dateAStr), b = new Date(dateBStr);
  return Math.abs((b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}
function yearOfLebensjahr(lebensjahr, birthDateStr) {
  return new Date(birthDateStr).getFullYear() + lebensjahr;
}
function rangeCoversYear(year, sinceStr, untilStr) {
  if (!sinceStr) return false;
  const sinceYear = new Date(sinceStr).getFullYear();
  const untilYear = untilStr ? new Date(untilStr).getFullYear() : new Date().getFullYear();
  return year >= sinceYear && year <= untilYear;
}
function breakCoversYear(year, breakFromStr, breakToStr) {
  if (!breakFromStr || !breakToStr) return false;
  return year >= new Date(breakFromStr).getFullYear() && year <= new Date(breakToStr).getFullYear();
}
function formatEuro(n) {
  return '€ ' + Math.round(n).toLocaleString('de-AT');
}

/* Schätzt die Ausbildungs- und Förderungsentschädigung für `player` bei einem
   Wechsel zu einem Verein der Leistungsstufe `receivingLevel` (1 = höchste). */
function calcAusbildungsentschaedigung(player, receivingLevel) {
  const result = { total: 0, breakdown: [], zeroReason: null };
  if (!player || !player.birthDate) return result;
  if (player.selfNoCompensationClaim) { result.zeroReason = 'self'; return result; }
  const age = calcAge(player.birthDate);
  if (age == null || age >= 28) { result.zeroReason = 'age'; return result; }
  if (player.hasBreak && player.breakFrom && player.breakTo) {
    if (monthsBetween(player.breakFrom, player.breakTo) >= 18) { result.zeroReason = 'break'; return result; }
  }
  const factor = AE_LEVEL_FACTOR[Math.min(Math.max(receivingLevel || 7, 1), 7)] || 0.4;
  const startAge = player.startDate ? Math.max(calcAge(player.birthDate, player.startDate), 9) : 9;
  for (let lj = 9; lj <= 23; lj++) {
    if (lj < startAge || lj > age) continue;
    const year = yearOfLebensjahr(lj, player.birthDate);
    if (breakCoversYear(year, player.breakFrom, player.breakTo)) continue;
    let base = AE_BASE_BY_AGE[lj] || 0;
    let bonus = 0, tags = [];
    if (player.academy && rangeCoversYear(year, player.academySince, player.academyUntil)) { bonus += 1600; tags.push('Akademie'); }
    if (player.laz && rangeCoversYear(year, player.lazSince, player.lazUntil)) { bonus += 700; tags.push('LAZ'); }
    const yearTotal = Math.round((base + bonus) * factor);
    result.breakdown.push({ lebensjahr: lj, base, bonus, tags, yearTotal });
    result.total += yearTotal;
  }
  result.total = Math.round(result.total);
  return result;
}

/* ---------------------------- Zufällige Demo-Datensätze (10 Spieler, 10 Vereine) ---------------------------- */
/* Werden bei jedem App-Start lokal im Browser generiert (siehe App-Komponente,
   State "demoPlayers"/"demoClubs") – unabhängig vom geteilten Speicher, damit
   sie immer verfügbar sind. */

const DEMO_FIRST_NAMES = ['Jonas', 'Luca', 'Finn', 'Elias', 'Noah', 'Paul', 'Felix', 'Leon', 'Maximilian', 'David', 'Tobias', 'Julian', 'Simon', 'Fabian', 'Lukas', 'Florian', 'Sebastian', 'Daniel', 'Alexander', 'Michael'];
const DEMO_LAST_NAMES = ['Weber', 'Hoffmann', 'Schröder', 'Krüger', 'Bergmann', 'Zimmermann', 'Wagner', 'Fischer', 'Huber', 'Gruber', 'Bauer', 'Steiner', 'Moser', 'Berger', 'Winkler', 'Egger', 'Pichler', 'Wimmer', 'Leitner', 'Auer'];
const DEMO_CLUB_PREFIX = ['SV', 'SC', 'FC', 'TuS', 'SG', 'ASK', 'ATSV', 'USV'];
const DEMO_CLUB_COLOR = ['Blau-Weiß', 'Rot-Gold', 'Grün-Weiß', 'Schwarz-Gelb', 'Rot-Weiß', 'Blau-Gelb'];
const DEMO_CLUB_PLACE = ['Lindenau', 'Eichenfeld', 'Steinbach', 'Hohenwald', 'Talheim', 'Bergheim', 'Sonnleiten', 'Auwald', 'Wolfsgraben', 'Kirchdorf', 'Neustift', 'Feldau'];

function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randBool(p = 0.5) { return Math.random() < p; }
function isoDate(year, month, day) { return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
function randomBirthDate(minAge, maxAge) {
  const year = new Date().getFullYear() - randInt(minAge, maxAge);
  return isoDate(year, randInt(1, 12), randInt(1, 28));
}
function randomDateAfter(dateStr, minYears, maxYears) {
  const year = Math.min(new Date(dateStr).getFullYear() + randInt(minYears, maxYears), new Date().getFullYear());
  return isoDate(year, randInt(1, 12), randInt(1, 28));
}

function generateDemoPlayer(index, sessionSeed) {
  const birthDate = randomBirthDate(16, 34);
  const startDate = randomDateAfter(birthDate, 5, 10);
  const position = randChoice(POSITIONS).code;
  const secondaryPosition = randBool(0.5) ? randChoice(POSITIONS.filter(p => p.code !== position)).code : '';
  const isGK = position === 'TW';
  const cityName = randChoice(AUSTRIA_CITIES);
  const coords = AUSTRIA_CITY_COORDS[cityName];

  const hasBreak = randBool(0.25);
  let breakFrom = '', breakTo = '';
  if (hasBreak) {
    breakFrom = randomDateAfter(startDate, 2, 10);
    const bf = new Date(breakFrom);
    bf.setMonth(bf.getMonth() + randInt(6, 30));
    breakTo = isoDate(bf.getFullYear(), bf.getMonth() + 1, Math.min(bf.getDate(), 28));
  }

  const laz = randBool(0.25);
  const lazSince = laz ? randomDateAfter(birthDate, 10, 14) : '';
  const lazUntil = laz && randBool(0.5) ? randomDateAfter(lazSince, 1, 4) : '';

  const academy = randBool(0.2);
  const academySince = academy ? randomDateAfter(birthDate, 12, 16) : '';
  const academyUntil = academy && randBool(0.5) ? randomDateAfter(academySince, 1, 4) : '';

  const hasYouth = randBool(0.5);

  return {
    id: `seed-${sessionSeed}-player-${index}`,
    role: 'player',
    name: `${randChoice(DEMO_FIRST_NAMES)} ${randChoice(DEMO_LAST_NAMES)}`,
    birthDate, position, secondaryPosition,
    strongFoot: randChoice(FEET),
    location: { label: cityName, lat: coords[0], lng: coords[1] },
    leagueAdult: randChoice(AUSTRIA_LEAGUE_LABELS),
    statsAdult: { einsaetze: randInt(5, 26), tore: isGK ? 0 : randInt(0, 15), vorlagen: isGK ? 0 : randInt(0, 12) },
    leagueYouth: hasYouth ? randChoice(LEAGUES_YOUTH) : '',
    statsYouth: hasYouth ? { einsaetze: randInt(5, 26), tore: isGK ? 0 : randInt(0, 15), vorlagen: isGK ? 0 : randInt(0, 12) } : { einsaetze: 0, tore: 0, vorlagen: 0 },
    startDate, hasBreak, breakFrom, breakTo, laz, lazSince, lazUntil, academy, academySince, academyUntil,
    selfNoCompensationClaim: randBool(0.15),
    needsPhysio: randBool(0.2), needsMasseur: randBool(0.2),
    createdAt: 1,
  };
}

function generateDemoClub(index, sessionSeed) {
  const cityName = randChoice(AUSTRIA_CITIES);
  const coords = AUSTRIA_CITY_COORDS[cityName];
  const searchedCount = randInt(1, 3);
  const searchedPositions = [];
  while (searchedPositions.length < searchedCount) {
    const code = randChoice(POSITIONS).code;
    if (!searchedPositions.includes(code)) searchedPositions.push(code);
  }
  const searchedStaffTypes = randBool(0.4) ? [randChoice(STAFF_TYPES).code] : [];
  const clubName = `${randChoice(DEMO_CLUB_PREFIX)} ${randChoice(DEMO_CLUB_COLOR)} ${randChoice(DEMO_CLUB_PLACE)}${randBool(0.4) ? ' ' + randChoice(['04', '09', '1919', '1921', '46']) : ''}`;
  return {
    id: `seed-${sessionSeed}-club-${index}`,
    role: 'club',
    clubName,
    contactPerson: `${randChoice(DEMO_FIRST_NAMES)} ${randChoice(DEMO_LAST_NAMES)}`,
    location: { label: cityName, lat: coords[0], lng: coords[1] },
    league: randChoice(AUSTRIA_LEAGUE_LABELS),
    searchedPositions,
    searchedStaffTypes,
    createdAt: 1,
  };
}

function generateDemoStaffPerson(index, sessionSeed) {
  const staffType = randChoice(STAFF_TYPES).code;
  const cityName = randChoice(AUSTRIA_CITIES);
  const coords = AUSTRIA_CITY_COORDS[cityName];
  return {
    id: `seed-${sessionSeed}-staff-${index}`,
    role: 'staff',
    staffType,
    name: `${randChoice(DEMO_FIRST_NAMES)} ${randChoice(DEMO_LAST_NAMES)}`,
    birthDate: randomBirthDate(22, 58),
    location: { label: cityName, lat: coords[0], lng: coords[1] },
    yearsExperience: randInt(1, 20),
    qualification: randChoice(staffQualificationOptions(staffType)),
    earliestAppointmentWeeks: staffType === 'physio' ? randInt(1, 8) : undefined,
    createdAt: 1,
  };
}

function generateDemoPlayers(n, sessionSeed) { return Array.from({ length: n }, (_, i) => generateDemoPlayer(i + 1, sessionSeed)); }
function generateDemoClubs(n, sessionSeed) { return Array.from({ length: n }, (_, i) => generateDemoClub(i + 1, sessionSeed)); }
function generateDemoStaff(n, sessionSeed) { return Array.from({ length: n }, (_, i) => generateDemoStaffPerson(i + 1, sessionSeed)); }

/* ---------------------------- Hilfsfunktionen ---------------------------- */

function haversineKm(a, b) {
  if (!a || !b || a[0] == null || b[0] == null) return null;
  const [lat1, lon1] = a, [lat2, lon2] = b;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function coordsOf(profile) {
  return profile && profile.location ? [profile.location.lat, profile.location.lng] : null;
}
/* Vereine speichern ihren Anzeigenamen unter "clubName", Spieler und Staff
   beide unter "name" - zentrale Stelle statt der Ternary an vielen Orten. */
function displayNameOf(profile) {
  if (!profile) return '—';
  return profile.role === 'club' ? profile.clubName : profile.name;
}
/* Kurzlabel für den Profil-Umschalter (TopBar), z. B. "Spieler" / "Trainer" / "Verein". */
function profileRoleLabel(profile) {
  if (!profile) return '';
  if (profile.role === 'player') return 'Spieler';
  if (profile.role === 'club') return 'Verein';
  if (profile.role === 'staff') return staffTypeByCode(profile.staffType)?.label || 'Staff';
  return profile.role;
}
function initials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}
function hueFromString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

/* ---------------------------- Kleine UI-Bausteine ---------------------------- */

function Avatar({ name, size = 52, revealed }) {
  if (!revealed) {
    return <div className="tm-avatar tm-avatar--locked" style={{ width: size, height: size }}><Lock size={Math.round(size * 0.4)} /></div>;
  }
  const hue = hueFromString(name || 'x');
  return (
    <div className="tm-avatar" style={{ width: size, height: size, background: `hsl(${hue} 38% 32%)`, color: '#F4EFE0' }}>
      {initials(name)}
    </div>
  );
}
function RedactedBar({ width = '70%', label }) {
  return <div className="tm-redacted" style={{ width }}><Lock size={12} /><span>{label || 'gesperrt'}</span></div>;
}
function StatChip({ label, value }) {
  return <div className="tm-statchip"><span className="tm-statchip-value">{value}</span><span className="tm-statchip-label">{label}</span></div>;
}
function PitchMini({ codes, secondaryCode }) {
  const main = (codes || []).filter(Boolean);
  return (
    <svg className="tm-pitch" viewBox="0 0 100 140" aria-hidden="true">
      <rect x="3" y="3" width="94" height="134" rx="4" className="tm-pitch-outline" />
      <line x1="3" y1="70" x2="97" y2="70" className="tm-pitch-outline" />
      <circle cx="50" cy="70" r="12" className="tm-pitch-outline" />
      <rect x="27" y="3" width="46" height="16" className="tm-pitch-outline" />
      <rect x="27" y="121" width="46" height="16" className="tm-pitch-outline" />
      {main.map((code) => {
        const p = posByCode(code);
        if (!p) return null;
        const isSecondary = code === secondaryCode;
        return <circle key={code} cx={p.x} cy={p.y} r={isSecondary ? 4 : 6} className={isSecondary ? 'tm-pitch-dot tm-pitch-dot--secondary' : 'tm-pitch-dot'} />;
      })}
    </svg>
  );
}
function BadgeRow({ laz, academy }) {
  if (!laz && !academy) return null;
  return (
    <div className="tm-badge-row">
      {laz && <span className="tm-badge"><GraduationCap size={11} /> LAZ</span>}
      {academy && <span className="tm-badge"><GraduationCap size={11} /> Akademie</span>}
    </div>
  );
}
function AEBox({ aeInfo, title }) {
  if (!aeInfo) return null;
  return (
    <div className="tm-ae-box">
      <div className="tm-ae-title"><Euro size={13} /> {title}</div>
      {aeInfo.zeroReason ? (
        <div className="tm-ae-amount tm-ae-amount--zero">€ 0 <span className="tm-ae-reason">· {AE_ZERO_REASON_TEXT[aeInfo.zeroReason]}</span></div>
      ) : (
        <div className="tm-ae-amount">ca. {formatEuro(aeInfo.total)}</div>
      )}
      <div className="tm-ae-caption">Schätzung nach ÖFB-Regulativ (Anhang I), keine Rechtsauskunft.</div>
    </div>
  );
}

/* Standortfeld: manuelle Auswahl + Live-GPS mit Adress-Rückwärtssuche (OpenStreetMap) */
/* Baut aus einer Nominatim-Adresse ein einheitliches "PLZ Ort"-Label (fällt auf
   vorhandene Teile zurück, falls PLZ oder Ortsname fehlen). */
function plzOrtLabel(address, fallback) {
  const ort = address?.city || address?.town || address?.village || address?.municipality || address?.suburb;
  const plz = address?.postcode;
  if (plz && ort) return `${plz} ${ort}`;
  return ort || fallback;
}

/* Standort-Suche über die komplette Nominatim/OpenStreetMap-Datenbank, auf
   Österreich eingeschränkt (countrycodes=at) - deckt jeden Ort/jede PLZ ab,
   ohne alle ~2.100 österreichischen Gemeinden fix im Code zu hinterlegen. */
function LocationField({ value, onChange }) {
  const [query, setQuery] = useState(value?.label || '');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | loading | error
  const debounceRef = useRef(null);

  function handleQueryChange(v) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=at&addressdetails=1&limit=8&q=${encodeURIComponent(v)}`);
        const data = await res.json();
        setSuggestions(data || []);
      } catch (e) { setSuggestions([]); }
      setSearching(false);
    }, 400);
  }

  function selectSuggestion(item) {
    const label = plzOrtLabel(item.address, item.display_name.split(',')[0]);
    onChange({ label, lat: Number(item.lat), lng: Number(item.lon) });
    setQuery(label);
    setSuggestions([]);
  }

  function useLiveLocation() {
    if (!navigator.geolocation) { setGeoStatus('error'); return; }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      let label = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
        const data = await res.json();
        label = plzOrtLabel(data?.address, data?.display_name || label);
      } catch (e) { /* Adresse konnte nicht ermittelt werden, Koordinaten-Label bleibt */ }
      onChange({ label, lat: latitude, lng: longitude });
      setQuery(label);
      setSuggestions([]);
      setGeoStatus('idle');
    }, () => setGeoStatus('error'), { enableHighAccuracy: false, timeout: 8000 });
  }

  return (
    <div className="tm-location-field">
      <div className="tm-location-row">
        <div className="tm-location-search">
          <input
            className="tm-input" value={query} onChange={e => handleQueryChange(e.target.value)}
            placeholder="PLZ oder Ort eingeben (z. B. 1010 Wien)"
          />
          {searching && <div className="tm-location-searching">Suche …</div>}
          {suggestions.length > 0 && (
            <div className="tm-location-suggestions">
              {suggestions.map((s) => (
                <button type="button" key={s.place_id} className="tm-location-suggestion" onClick={() => selectSuggestion(s)}>
                  <span>{plzOrtLabel(s.address, s.display_name)}</span>
                  <span className="tm-location-suggestion-sub">{s.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="tm-geo-btn" onClick={useLiveLocation}>
          <LocateFixed size={14} /> {geoStatus === 'loading' ? 'Ermittle …' : 'Live-Standort'}
        </button>
      </div>
      {value?.label && <div className="tm-location-current">Ausgewählt: {value.label}</div>}
      {geoStatus === 'error' && <div className="tm-error">Standort konnte nicht ermittelt werden. Bitte Ort manuell suchen.</div>}
    </div>
  );
}

/* ---------------------------- Datenschutz ---------------------------- */

const PRIVACY_POLICY_PARAGRAPHS = [
  'Datenschutzerklärung (Entwurf – Prototyp)\n\nVerantwortlicher: [Name/Unternehmen einfügen], [Adresse einfügen], [Kontakt-E-Mail einfügen]. Bitte vor echtem Einsatz vollständig ausfüllen und von einer fachkundigen Person prüfen lassen.',
  '1. Welche Daten wir verarbeiten\nSpieler:innen: Name, Geburtsdatum, Position(en), starker Fuß, Liga- und Statistikangaben, Beginn des Fußballspielens, Pausenzeiten, LAZ-/Akademie-Zeiträume, Standort (Ortsname bzw. bei Nutzung der Live-Standort-Funktion Geokoordinaten), E-Mail-Adresse.\nVereine: Vereinsname, Ansprechpartner:in, gesuchte Positionen, Liga, Standort, E-Mail-Adresse.\nZusätzlich: Nachrichten im Chat nach einem Match.',
  '2. Zweck der Verarbeitung\nDie Daten werden ausschließlich verarbeitet, um passende Spieler:innen und Vereine füreinander sichtbar zu machen (Matching-Funktion), die Kommunikation nach einem Match zu ermöglichen und die geschätzte Ausbildungsentschädigung anzuzeigen.',
  '3. Rechtsgrundlage\nDie Verarbeitung erfolgt auf Grundlage deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Du kannst deine Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen, z. B. über die Löschfunktion in deinem Profil.',
  '4. Minderjährige\nFür Nachwuchsspieler:innen unter 18 Jahren ist die Nutzung nur mit Einwilligung der Erziehungsberechtigten zulässig. Mit dem Anlegen eines Profils bestätigen minderjährige Nutzer:innen, dass diese Einwilligung vorliegt.',
  '5. Sichtbarkeit deiner Daten\nVor einem Match sehen andere Nutzer:innen nur eingeschränkte, anonymisierte Angaben (z. B. Position und Statistik bzw. Entfernung, gesuchte Position und Liga) – kein Name, kein Foto. Nach einem gegenseitigen Match werden Name bzw. Vereinsname und Ansprechpartner:in sichtbar. Exakte Standortkoordinaten werden nie an andere Nutzer:innen weitergegeben, nur die berechnete Entfernung in Kilometern.',
  '6. Empfänger und externe Dienste\nBei Nutzung der Live-Standort-Funktion wird die Adress-Rückwärtssuche über OpenStreetMap/Nominatim durchgeführt; dabei werden Koordinaten an diesen Dienst übertragen. Der Link „Auf Google Maps ansehen" führt zu Google Maps; es gelten dort die Datenschutzbestimmungen von Google.',
  '7. Speicherdauer\nDeine Daten werden gespeichert, bis du dein Profil löschst oder deine Einwilligung widerrufst.',
  '8. Deine Rechte\nDu hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht auf Beschwerde bei der österreichischen Datenschutzbehörde (dsb.gv.at).',
  '9. Login\nDie Registrierung erfolgt per E-Mail-Adresse und selbst gewähltem Passwort. Nach der Registrierung erhältst du eine Bestätigungsmail; erst nach Klick auf den Link darin ist dein Konto aktiv. Bitte gib dein Passwort nicht an Dritte weiter.',
  '10. Prototyp-Hinweis\nDies ist ein Prototyp zu Testzwecken, kein Produktivsystem. Testprofile können jederzeit über „Profil löschen" entfernt werden.',
];

function PolicyOverlay({ onClose }) {
  return (
    <div className="tm-overlay" onClick={onClose}>
      <div className="tm-overlay-card tm-overlay-card--scroll" onClick={e => e.stopPropagation()}>
        <div className="tm-policy-text">
          {PRIVACY_POLICY_PARAGRAPHS.map((p, i) => (
            <p key={i}>{p.split('\n').map((line, j) => <React.Fragment key={j}>{j > 0 && <br />}{line}</React.Fragment>)}</p>
          ))}
        </div>
        <button className="tm-btn tm-btn--primary" onClick={onClose}>Schließen</button>
      </div>
    </div>
  );
}

/* ---------------------------- Rollen-/Onboarding-Screens ---------------------------- */

function SetupScreen() {
  return (
    <div className="tm-center-screen">
      <div className="tm-brand"><span className="tm-brand-text">WECHSEL</span><span className="tm-brand-dot">.</span></div>
      <p className="tm-tagline">Setup unvollständig – die App braucht eine Verbindung zu Supabase.</p>
      <div className="tm-email-gate">
        <div className="tm-card-name">.env-Datei fehlt oder ist leer</div>
        <div className="tm-card-sub">
          Kopiere <code>.env.example</code> zu <code>.env</code> und trage <code>VITE_SUPABASE_URL</code> sowie{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> aus deinem Supabase-Projekt ein (Project Settings → API).
          Danach den Dev-Server neu starten. Details siehe README.md.
        </div>
      </div>
    </div>
  );
}

function LandingPage({ onStart }) {
  const [showPrivacy, setShowPrivacy] = useState(false);
  return (
    <div className="tm-landing">
      <div className="tm-landing-hero">
        <div className="tm-brand"><span className="tm-brand-text">WECHSEL</span><span className="tm-brand-dot">.</span></div>
        <p className="tm-landing-headline">Der Transfermarkt für den Amateurfußball in Österreich.</p>
        <p className="tm-landing-sub">
          Spieler, Vereine, Trainer, Funktionär:innen, Physios und Masseur:innen finden sich anonym –
          Namen und Kontaktdaten werden erst sichtbar, wenn beide Seiten Interesse zeigen.
        </p>
        <button className="tm-btn tm-btn--primary tm-landing-cta" onClick={onStart}>
          Kostenlos starten <ArrowRight size={16} />
        </button>
      </div>

      <div className="tm-landing-section">
        <div className="tm-fieldset-title">So funktioniert's</div>
        <div className="tm-landing-steps">
          <div className="tm-landing-step">
            <div className="tm-landing-step-num">1</div>
            <div>
              <div className="tm-card-name">Profil anlegen</div>
              <div className="tm-card-sub">Anonym, ohne Namen oder Foto – nur die für ein Matching relevanten Eckdaten.</div>
            </div>
          </div>
          <div className="tm-landing-step">
            <div className="tm-landing-step-num">2</div>
            <div>
              <div className="tm-card-name">Swipen &amp; matchen</div>
              <div className="tm-card-sub">Zeig Interesse an Spielern, Vereinen oder Staff – bei Gegenseitigkeit entsteht sofort ein Match.</div>
            </div>
          </div>
          <div className="tm-landing-step">
            <div className="tm-landing-step-num">3</div>
            <div>
              <div className="tm-card-name">Chatten &amp; Kontakt austauschen</div>
              <div className="tm-card-sub">Erst nach dem Match werden Name und Details sichtbar – dann geht's direkt im Chat weiter.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="tm-landing-section">
        <div className="tm-fieldset-title">Für wen?</div>
        <div className="tm-landing-audience-grid">
          <div className="tm-landing-audience-card">
            <User size={20} />
            <div className="tm-card-name">Spieler</div>
            <div className="tm-card-sub">Neuen Verein finden, Ausbildungsentschädigung direkt sehen.</div>
          </div>
          <div className="tm-landing-audience-card">
            <Users size={20} />
            <div className="tm-card-name">Vereine</div>
            <div className="tm-card-sub">Spieler &amp; Staff für offene Positionen finden.</div>
          </div>
          <div className="tm-landing-audience-card">
            <Briefcase size={20} />
            <div className="tm-card-name">Trainer &amp; Funktionäre</div>
            <div className="tm-card-sub">Vereine finden, die genau euch suchen.</div>
          </div>
          <div className="tm-landing-audience-card">
            <Stethoscope size={20} />
            <div className="tm-card-name">Physio &amp; Masseur:in</div>
            <div className="tm-card-sub">Spieler und Vereine mit Betreuungsbedarf finden.</div>
          </div>
        </div>
      </div>

      <div className="tm-landing-section">
        <div className="tm-fieldset-title">Warum WECHSEL.</div>
        <div className="tm-landing-features">
          <div className="tm-landing-feature"><Lock size={16} /> Anonym bis zum Match – kein Name, kein Foto vorher sichtbar</div>
          <div className="tm-landing-feature"><Euro size={16} /> Automatische Schätzung der Ausbildungsentschädigung</div>
          <div className="tm-landing-feature"><MapPin size={16} /> Zeigt nur die Entfernung, nie den exakten Standort anderer</div>
          <div className="tm-landing-feature"><MessageCircle size={16} /> Chat direkt in der App, sobald ihr gematcht habt</div>
        </div>
      </div>

      <div className="tm-landing-footer">
        <button className="tm-btn tm-btn--primary tm-landing-cta" onClick={onStart}>Kostenlos starten <ArrowRight size={16} /></button>
        <button type="button" className="tm-link-btn" onClick={() => setShowPrivacy(true)}>Datenschutzerklärung</button>
      </div>
      {showPrivacy && <PolicyOverlay onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}

function LoginScreen({ onBack }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | signupSent | error
  const [errorMessage, setErrorMessage] = useState('');

  function switchMode(nextMode) {
    setMode(nextMode);
    setStatus('idle');
    setErrorMessage('');
    setPassword('');
    setPasswordConfirm('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setStatus('error');
      setErrorMessage('Bitte gültige E-Mail-Adresse angeben.');
      return;
    }
    if (password.length < 6) {
      setStatus('error');
      setErrorMessage('Das Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }
    if (mode === 'signup' && password !== passwordConfirm) {
      setStatus('error');
      setErrorMessage('Die Passwörter stimmen nicht überein.');
      return;
    }
    setStatus('sending');
    try {
      if (mode === 'signup') {
        const needsConfirmation = await signUpWithPassword(email.trim().toLowerCase(), password);
        setStatus(needsConfirmation ? 'signupSent' : 'idle');
      } else {
        await signInWithPassword(email.trim().toLowerCase(), password);
        // Erfolgreicher Login löst den onAuthStateChange-Listener in App aus, kein weiterer State nötig hier.
      }
    } catch (err) {
      setStatus('error');
      if (/already registered/i.test(err?.message || '')) {
        setErrorMessage('Für diese E-Mail existiert bereits ein Konto. Bitte stattdessen anmelden.');
      } else if (/invalid login credentials/i.test(err?.message || '')) {
        setErrorMessage('E-Mail oder Passwort ist falsch.');
      } else if (/email not confirmed/i.test(err?.message || '')) {
        setErrorMessage('Bitte bestätige zuerst deine E-Mail-Adresse über den Link, den wir dir geschickt haben.');
      } else if (err?.status === 429 || /rate limit/i.test(err?.message || '')) {
        setErrorMessage('Zu viele Versuche in kurzer Zeit. Bitte einige Minuten warten und erneut versuchen.');
      } else {
        setErrorMessage(err?.message || 'Etwas ist schiefgelaufen. Bitte erneut versuchen.');
      }
    }
  }

  return (
    <div className="tm-center-screen">
      {onBack && <button className="tm-back-link" onClick={onBack}><ChevronLeft size={16} /> Zurück</button>}
      <div className="tm-brand"><span className="tm-brand-text">WECHSEL</span><span className="tm-brand-dot">.</span></div>
      <p className="tm-tagline">Transfers im Amateurfußball – anonym anbahnen, erst beim Match Klartext reden.</p>

      {status === 'signupSent' ? (
        <div className="tm-email-gate">
          <Mail size={22} />
          <div className="tm-card-name">Fast geschafft!</div>
          <div className="tm-card-sub">Öffne dein E-Mail-Postfach und bestätige deine Adresse über den Link darin. Danach kannst du dich hier mit deinem Passwort anmelden.</div>
          <button type="button" className="tm-link-btn" onClick={() => switchMode('login')}>Zur Anmeldung</button>
        </div>
      ) : (
        <form className="tm-email-gate" onSubmit={handleSubmit}>
          <label className="tm-label tm-label--wide">E-Mail
            <input className="tm-input" type="email" placeholder="deine@email.at" value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="tm-label tm-label--wide">Passwort
            <input className="tm-input" type="password" placeholder="mind. 6 Zeichen" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          {mode === 'signup' && (
            <label className="tm-label tm-label--wide">Passwort wiederholen
              <input className="tm-input" type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} />
            </label>
          )}
          <button className="tm-btn tm-btn--primary" type="submit">
            {status === 'sending' ? (mode === 'signup' ? 'Registriere …' : 'Melde an …') : (mode === 'signup' ? 'Registrieren' : 'Anmelden')}
          </button>
          {status === 'error' && <div className="tm-error">{errorMessage}</div>}
          {mode === 'login' ? (
            <button type="button" className="tm-link-btn" onClick={() => switchMode('signup')}>Noch kein Konto? Registrieren</button>
          ) : (
            <button type="button" className="tm-link-btn" onClick={() => switchMode('login')}>Schon registriert? Anmelden</button>
          )}
        </form>
      )}
    </div>
  );
}

function RoleSelect({ onSelect, onBack }) {
  return (
    <div className="tm-center-screen">
      {onBack && <button className="tm-back-link" onClick={onBack}><ChevronLeft size={16} /> Zurück</button>}
      <div className="tm-brand"><span className="tm-brand-text">WECHSEL</span><span className="tm-brand-dot">.</span></div>
      <p className="tm-tagline">{onBack ? 'Als wer möchtest du zusätzlich ein Profil anlegen?' : 'Fast geschafft – leg jetzt dein Profil an.'}</p>
      <div className="tm-role-cards">
        <button className="tm-role-card" onClick={() => onSelect('player')}>
          <User size={26} /><span className="tm-role-title">Ich bin Spieler</span><span className="tm-role-sub">Suche einen neuen Verein</span>
        </button>
        <button className="tm-role-card" onClick={() => onSelect('club')}>
          <Users size={26} /><span className="tm-role-title">Wir sind ein Verein</span><span className="tm-role-sub">Suchen Spieler für offene Positionen</span>
        </button>
        <button className="tm-role-card" onClick={() => onSelect('staff')}>
          <Briefcase size={26} /><span className="tm-role-title">Trainer, Physio & Co.</span><span className="tm-role-sub">Trainer, Funktionär, Physio oder Masseur – suche einen Verein</span>
        </button>
      </div>
    </div>
  );
}

function OnboardingForm({ role, onBack, onSubmit, initialValues }) {
  const isPlayer = role === 'player';
  const isStaff = role === 'staff';
  const isClub = role === 'club';
  const isEditing = Boolean(initialValues);
  const [firstName, setFirstName] = useState(
    initialValues?.firstName || initialValues?.name?.trim().split(/\s+/).slice(0, -1).join(' ') || ''
  );
  const [lastName, setLastName] = useState(
    initialValues?.lastName || initialValues?.name?.trim().split(/\s+/).slice(-1).join(' ') || ''
  );
  const [birthDate, setBirthDate] = useState(initialValues?.birthDate || '');
  const [position, setPosition] = useState(initialValues?.position || '');
  const [secondaryPosition, setSecondaryPosition] = useState(initialValues?.secondaryPosition || '');
  const [strongFoot, setStrongFoot] = useState(initialValues?.strongFoot || '');
  const [location, setLocation] = useState(initialValues?.location || null);
  const [leagueAdult, setLeagueAdult] = useState(initialValues?.leagueAdult || '');
  const [statsAdult, setStatsAdult] = useState(initialValues?.statsAdult || { einsaetze: 0, tore: 0, vorlagen: 0 });
  const [hasYouth, setHasYouth] = useState(Boolean(initialValues?.leagueYouth));
  const [leagueYouth, setLeagueYouth] = useState(initialValues?.leagueYouth || '');
  const [statsYouth, setStatsYouth] = useState(initialValues?.statsYouth || { einsaetze: 0, tore: 0, vorlagen: 0 });
  const [needsPhysio, setNeedsPhysio] = useState(initialValues?.needsPhysio || false);
  const [needsMasseur, setNeedsMasseur] = useState(initialValues?.needsMasseur || false);

  const [startDate, setStartDate] = useState(initialValues?.startDate || '');
  const [hasBreak, setHasBreak] = useState(initialValues?.hasBreak || false);
  const [breakFrom, setBreakFrom] = useState(initialValues?.breakFrom || '');
  const [breakTo, setBreakTo] = useState(initialValues?.breakTo || '');
  const [laz, setLaz] = useState(initialValues?.laz || false);
  const [lazSince, setLazSince] = useState(initialValues?.lazSince || '');
  const [lazUntil, setLazUntil] = useState(initialValues?.lazUntil || '');
  const [academy, setAcademy] = useState(initialValues?.academy || false);
  const [academySince, setAcademySince] = useState(initialValues?.academySince || '');
  const [academyUntil, setAcademyUntil] = useState(initialValues?.academyUntil || '');
  const [selfNoCompensationClaim, setSelfNoCompensationClaim] = useState(initialValues?.selfNoCompensationClaim || false);

  const [clubName, setClubName] = useState(initialValues?.clubName || '');
  const [contactPerson, setContactPerson] = useState(initialValues?.contactPerson || '');
  const [league, setLeague] = useState(initialValues?.league || '');
  const [searchedPositions, setSearchedPositions] = useState(initialValues?.searchedPositions || []);
  const [searchedStaffTypes, setSearchedStaffTypes] = useState(initialValues?.searchedStaffTypes || []);

  const [staffType, setStaffType] = useState(initialValues?.staffType || '');
  const [yearsExperience, setYearsExperience] = useState(initialValues?.yearsExperience || 0);
  const [qualification, setQualification] = useState(initialValues?.qualification || '');
  const [earliestAppointmentWeeks, setEarliestAppointmentWeeks] = useState(initialValues?.earliestAppointmentWeeks ?? '');

  const [privacyConsent, setPrivacyConsent] = useState(isEditing);
  const [parentalConsent, setParentalConsent] = useState(initialValues?.parentalConsent || false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const [err, setErr] = useState('');

  const isMinor = (isPlayer || isStaff) && birthDate && calcAge(birthDate) < 18;

  function toggleSearchedPosition(code) {
    setSearchedPositions(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  }
  function toggleSearchedStaffType(code) {
    setSearchedStaffTypes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!isEditing) {
      if (!privacyConsent) { setErr('Bitte stimme der Datenschutzerklärung zu.'); return; }
      if (isMinor && !parentalConsent) { setErr('Bitte bestätige die Einwilligung deiner Erziehungsberechtigten.'); return; }
    }
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (isPlayer) {
      if (!firstName.trim() || !lastName.trim() || !birthDate || !position || !strongFoot || !location?.label || !leagueAdult || !startDate) {
        setErr('Bitte fülle alle Pflichtfelder aus (inkl. Vor-/Nachname, Geburtsdatum, Beginn Fußballspielen und Standort).'); return;
      }
      if (hasBreak && (!breakFrom || !breakTo || breakTo <= breakFrom)) {
        setErr('Bitte gib den Pause-Zeitraum korrekt an (bis muss nach von liegen).'); return;
      }
      if (laz && !lazSince) { setErr('Bitte gib an, seit wann du im LAZ warst/bist.'); return; }
      if (academy && !academySince) { setErr('Bitte gib an, seit wann du in der Akademie warst/bist.'); return; }
      onSubmit({
        name: fullName, firstName: firstName.trim(), lastName: lastName.trim(), birthDate, position, secondaryPosition, strongFoot, location, leagueAdult, statsAdult,
        leagueYouth: hasYouth ? leagueYouth : '', statsYouth: hasYouth ? statsYouth : { einsaetze: 0, tore: 0, vorlagen: 0 },
        startDate, hasBreak, breakFrom: hasBreak ? breakFrom : '', breakTo: hasBreak ? breakTo : '',
        laz, lazSince: laz ? lazSince : '', lazUntil: laz ? lazUntil : '',
        academy, academySince: academy ? academySince : '', academyUntil: academy ? academyUntil : '',
        selfNoCompensationClaim, needsPhysio, needsMasseur,
        privacyConsentAt: initialValues?.privacyConsentAt || Date.now(), parentalConsent: isMinor ? true : false,
      });
    } else if (isStaff) {
      if (!firstName.trim() || !lastName.trim() || !staffType || !qualification || !location?.label) {
        setErr('Bitte fülle alle Pflichtfelder aus (inkl. Vor-/Nachname, Rolle, Qualifikation und Standort).'); return;
      }
      onSubmit({
        name: fullName, firstName: firstName.trim(), lastName: lastName.trim(), birthDate, staffType, qualification, yearsExperience, location,
        earliestAppointmentWeeks: staffType === 'physio' && earliestAppointmentWeeks !== '' ? Number(earliestAppointmentWeeks) : undefined,
        privacyConsentAt: initialValues?.privacyConsentAt || Date.now(), parentalConsent: isMinor ? true : false,
      });
    } else {
      if (!clubName.trim() || !location?.label || !league || (searchedPositions.length === 0 && searchedStaffTypes.length === 0)) {
        setErr('Bitte fülle alle Pflichtfelder aus und wähle mind. eine gesuchte Position oder Staff-Rolle.'); return;
      }
      onSubmit({ clubName: clubName.trim(), contactPerson: contactPerson.trim(), location, league, searchedPositions, searchedStaffTypes, privacyConsentAt: initialValues?.privacyConsentAt || Date.now() });
    }
  }

  return (
    <div className="tm-screen">
      <button className="tm-back-link" onClick={onBack}><ChevronLeft size={16} /> Zurück</button>
      <h2 className="tm-h2">
        {isEditing ? 'Profil bearbeiten' : isPlayer ? 'Spielerprofil anlegen' : isStaff ? 'Trainer-/Staff-Profil anlegen' : 'Vereinsprofil anlegen'}
      </h2>
      <form className="tm-form" onSubmit={handleSubmit}>
        {isPlayer ? (
          <>
            <div className="tm-date-row">
              <label className="tm-label tm-label--small">Vorname<input className="tm-input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Vorname" /></label>
              <label className="tm-label tm-label--small">Nachname<input className="tm-input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nachname" /></label>
            </div>
            <label className="tm-label">Geburtsdatum<input className="tm-input" type="date" max={TODAY_ISO} value={birthDate} onChange={e => setBirthDate(e.target.value)} /></label>
            <label className="tm-label">Hauptposition
              <select className="tm-input" value={position} onChange={e => setPosition(e.target.value)}>
                <option value="">— wählen —</option>
                {POSITIONS.map(p => <option key={p.code} value={p.code}>{p.code} – {p.label}</option>)}
              </select>
            </label>
            <label className="tm-label">Nebenposition (optional)
              <select className="tm-input" value={secondaryPosition} onChange={e => setSecondaryPosition(e.target.value)}>
                <option value="">— keine —</option>
                {POSITIONS.filter(p => p.code !== position).map(p => <option key={p.code} value={p.code}>{p.code} – {p.label}</option>)}
              </select>
            </label>
            <label className="tm-label">Starker Fuß
              <select className="tm-input" value={strongFoot} onChange={e => setStrongFoot(e.target.value)}>
                <option value="">— wählen —</option>
                {FEET.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <div className="tm-label">Standort<LocationField value={location} onChange={setLocation} /></div>

            <div className="tm-fieldset-title">Erwachsenenbereich</div>
            <label className="tm-label">Höchste Spielklasse
              <select className="tm-input" value={leagueAdult} onChange={e => setLeagueAdult(e.target.value)}>
                <option value="">— wählen —</option>
                {AUSTRIA_LEAGUE_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <div className="tm-stat-row">
              <label className="tm-label tm-label--small">Einsätze<input className="tm-input" type="number" min="0" value={statsAdult.einsaetze} onFocus={e => e.target.select()} onChange={e => setStatsAdult(s => ({ ...s, einsaetze: Number(e.target.value) }))} /></label>
              <label className="tm-label tm-label--small">Tore<input className="tm-input" type="number" min="0" value={statsAdult.tore} onFocus={e => e.target.select()} onChange={e => setStatsAdult(s => ({ ...s, tore: Number(e.target.value) }))} /></label>
              <label className="tm-label tm-label--small">Vorlagen<input className="tm-input" type="number" min="0" value={statsAdult.vorlagen} onFocus={e => e.target.select()} onChange={e => setStatsAdult(s => ({ ...s, vorlagen: Number(e.target.value) }))} /></label>
            </div>

            <label className="tm-checkbox-row">
              <input type="checkbox" checked={hasYouth} onChange={e => setHasYouth(e.target.checked)} />
              Ich möchte zusätzlich Nachwuchsdaten angeben
            </label>
            {hasYouth && (
              <>
                <div className="tm-fieldset-title">Nachwuchsbereich</div>
                <label className="tm-label">Höchste Spielklasse (Jugend)
                  <select className="tm-input" value={leagueYouth} onChange={e => setLeagueYouth(e.target.value)}>
                    <option value="">— wählen —</option>
                    {LEAGUES_YOUTH.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <div className="tm-stat-row">
                  <label className="tm-label tm-label--small">Einsätze<input className="tm-input" type="number" min="0" value={statsYouth.einsaetze} onFocus={e => e.target.select()} onChange={e => setStatsYouth(s => ({ ...s, einsaetze: Number(e.target.value) }))} /></label>
                  <label className="tm-label tm-label--small">Tore<input className="tm-input" type="number" min="0" value={statsYouth.tore} onFocus={e => e.target.select()} onChange={e => setStatsYouth(s => ({ ...s, tore: Number(e.target.value) }))} /></label>
                  <label className="tm-label tm-label--small">Vorlagen<input className="tm-input" type="number" min="0" value={statsYouth.vorlagen} onFocus={e => e.target.select()} onChange={e => setStatsYouth(s => ({ ...s, vorlagen: Number(e.target.value) }))} /></label>
                </div>
              </>
            )}

            <div className="tm-fieldset-title">Ausbildung (für Ausbildungsentschädigung)</div>
            <label className="tm-label">Begonnen zum Fußballspielen<input className="tm-input" type="date" max={TODAY_ISO} value={startDate} onChange={e => setStartDate(e.target.value)} /></label>

            <label className="tm-checkbox-row">
              <input type="checkbox" checked={hasBreak} onChange={e => setHasBreak(e.target.checked)} />
              Pause von mehr als 18 Monaten ohne Spielbetrieb
            </label>
            {hasBreak && (
              <div className="tm-date-row">
                <label className="tm-label tm-label--small">Pause von<input className="tm-input" type="date" max={TODAY_ISO} value={breakFrom} onChange={e => setBreakFrom(e.target.value)} /></label>
                <label className="tm-label tm-label--small">bis<input className="tm-input" type="date" max={TODAY_ISO} value={breakTo} onChange={e => setBreakTo(e.target.value)} /></label>
              </div>
            )}

            <label className="tm-checkbox-row">
              <input type="checkbox" checked={laz} onChange={e => setLaz(e.target.checked)} />
              LAZ (Landesausbildungszentrum) – ja
            </label>
            {laz && (
              <div className="tm-date-row">
                <label className="tm-label tm-label--small">LAZ seit<input className="tm-input" type="date" max={TODAY_ISO} value={lazSince} onChange={e => setLazSince(e.target.value)} /></label>
                <label className="tm-label tm-label--small">bis (leer = aktuell)<input className="tm-input" type="date" max={TODAY_ISO} value={lazUntil} onChange={e => setLazUntil(e.target.value)} /></label>
              </div>
            )}

            <label className="tm-checkbox-row">
              <input type="checkbox" checked={academy} onChange={e => setAcademy(e.target.checked)} />
              Akademie – ja
            </label>
            {academy && (
              <div className="tm-date-row">
                <label className="tm-label tm-label--small">Akademie seit<input className="tm-input" type="date" max={TODAY_ISO} value={academySince} onChange={e => setAcademySince(e.target.value)} /></label>
                <label className="tm-label tm-label--small">bis (leer = aktuell)<input className="tm-input" type="date" max={TODAY_ISO} value={academyUntil} onChange={e => setAcademyUntil(e.target.value)} /></label>
              </div>
            )}

            <label className="tm-checkbox-row">
              <input type="checkbox" checked={selfNoCompensationClaim} onChange={e => setSelfNoCompensationClaim(e.target.checked)} />
              Für mich besteht keine Ausbildungsentschädigung (Selbstauskunft, z. B. Verzicht meines bisherigen Vereins)
            </label>

            <div className="tm-fieldset-title">Betreuungsbedarf (optional)</div>
            <label className="tm-checkbox-row">
              <input type="checkbox" checked={needsPhysio} onChange={e => setNeedsPhysio(e.target.checked)} />
              Ich suche eine:n Physio
            </label>
            <label className="tm-checkbox-row">
              <input type="checkbox" checked={needsMasseur} onChange={e => setNeedsMasseur(e.target.checked)} />
              Ich suche eine:n Masseur:in
            </label>
          </>
        ) : isStaff ? (
          <>
            <div className="tm-date-row">
              <label className="tm-label tm-label--small">Vorname<input className="tm-input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Vorname" /></label>
              <label className="tm-label tm-label--small">Nachname<input className="tm-input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nachname" /></label>
            </div>
            <label className="tm-label">Geburtsdatum (optional)<input className="tm-input" type="date" max={TODAY_ISO} value={birthDate} onChange={e => setBirthDate(e.target.value)} /></label>
            <label className="tm-label">Rolle
              <select className="tm-input" value={staffType} onChange={e => { setStaffType(e.target.value); setQualification(''); }}>
                <option value="">— wählen —</option>
                {STAFF_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </label>
            {staffType && (
              <label className="tm-label">{staffQualificationLabel(staffType)}
                <select className="tm-input" value={qualification} onChange={e => setQualification(e.target.value)}>
                  <option value="">— wählen —</option>
                  {staffQualificationOptions(staffType).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            )}
            <label className="tm-label">Erfahrung (Jahre)<input className="tm-input" type="number" min="0" value={yearsExperience} onFocus={e => e.target.select()} onChange={e => setYearsExperience(Number(e.target.value))} /></label>
            {staffType === 'physio' && (
              <label className="tm-label">Frühester Termin (Wochen)
                <input className="tm-input" type="number" min="0" value={earliestAppointmentWeeks} onFocus={e => e.target.select()} onChange={e => setEarliestAppointmentWeeks(e.target.value)} />
              </label>
            )}
            <div className="tm-label">Standort<LocationField value={location} onChange={setLocation} /></div>
          </>
        ) : (
          <>
            <label className="tm-label">Vereinsname<input className="tm-input" value={clubName} onChange={e => setClubName(e.target.value)} placeholder="z. B. SV Musterstadt" /></label>
            <label className="tm-label">Ansprechpartner<input className="tm-input" value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Name, z. B. Trainer/Sportlicher Leiter" /></label>
            <div className="tm-label">Standort<LocationField value={location} onChange={setLocation} /></div>
            <label className="tm-label">Liga / Spielklasse der Mannschaft
              <select className="tm-input" value={league} onChange={e => setLeague(e.target.value)}>
                <option value="">— wählen —</option>
                {AUSTRIA_LEAGUE_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <div className="tm-fieldset-title">Gesuchte Position(en)</div>
            <div className="tm-checkbox-grid">
              {POSITIONS.map(p => (
                <label key={p.code} className={'tm-pos-check' + (searchedPositions.includes(p.code) ? ' tm-pos-check--active' : '')}>
                  <input type="checkbox" checked={searchedPositions.includes(p.code)} onChange={() => toggleSearchedPosition(p.code)} />
                  {p.code}
                </label>
              ))}
            </div>
            <div className="tm-fieldset-title">Gesuchte Staff-Rollen (optional)</div>
            <div className="tm-checkbox-grid">
              {STAFF_TYPES.map(t => (
                <label key={t.code} className={'tm-pos-check' + (searchedStaffTypes.includes(t.code) ? ' tm-pos-check--active' : '')}>
                  <input type="checkbox" checked={searchedStaffTypes.includes(t.code)} onChange={() => toggleSearchedStaffType(t.code)} />
                  {t.label}
                </label>
              ))}
            </div>
          </>
        )}

        {!isEditing && (
          <>
            <div className="tm-fieldset-title">Datenschutz</div>
            <button type="button" className="tm-link-btn" onClick={() => setShowPrivacy(true)}>Datenschutzerklärung lesen</button>
            <label className="tm-checkbox-row">
              <input type="checkbox" checked={privacyConsent} onChange={e => setPrivacyConsent(e.target.checked)} />
              Ich habe die Datenschutzerklärung gelesen und stimme der Verarbeitung meiner Daten zu.
            </label>
            {isMinor && (
              <label className="tm-checkbox-row">
                <input type="checkbox" checked={parentalConsent} onChange={e => setParentalConsent(e.target.checked)} />
                Meine Erziehungsberechtigten sind mit der Nutzung dieser App und der Veröffentlichung meines (anonymisierten) Profils einverstanden.
              </label>
            )}
            {showPrivacy && <PolicyOverlay onClose={() => setShowPrivacy(false)} />}
          </>
        )}

        {err && <div className="tm-error">{err}</div>}
        <button className="tm-btn tm-btn--primary" type="submit">{isEditing ? 'Änderungen speichern' : 'Profil erstellen'}</button>
      </form>
    </div>
  );
}

/* ---------------------------- Entdecken (Swipe-Deck) ---------------------------- */

function DiscoverCard({ profile, myProfile, revealed, distanceKm, exitDirection, dragX, dragging, onPointerDown, onPointerMove, onPointerUp }) {
  const style = {
    transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)`,
    transition: dragging ? 'none' : 'transform 0.25s ease, opacity 0.25s ease',
    opacity: exitDirection ? 0 : 1,
  };
  if (exitDirection === 'right') style.transform = 'translateX(640px) rotate(24deg)';
  if (exitDirection === 'left') style.transform = 'translateX(-640px) rotate(-24deg)';

  const isPlayerCard = profile.role === 'player';
  const isClubCard = profile.role === 'club';
  const isStaffCard = profile.role === 'staff';
  const age = (isPlayerCard || isStaffCard) && profile.birthDate ? calcAge(profile.birthDate) : null;
  const displayName = isClubCard ? profile.clubName : profile.name;
  const staffMeta = isStaffCard ? staffTypeByCode(profile.staffType) : null;
  const StaffIcon = staffMeta?.icon;

  /* Ausbildungsentschädigung gilt ausschließlich für Spielertransfers - bewusst
     strikt an role === 'player' / role === 'club' gebunden statt als "sonst"-
     Zweig, sonst würde sie fälschlich auch bei Staff-Profilen greifen. */
  let aeInfo = null, aeTitle = '';
  if (isPlayerCard && myProfile.role === 'club') {
    aeInfo = calcAusbildungsentschaedigung(profile, levelForLeague(myProfile.league));
    aeTitle = 'Errechnet: Gesamtkosten für eure Leistungsstufe';
  } else if (isClubCard && myProfile.role === 'player') {
    aeInfo = calcAusbildungsentschaedigung(myProfile, levelForLeague(profile.league));
    aeTitle = 'Das müsste dieser Verein für dich zahlen';
  }

  const stampLabel = isPlayerCard ? 'SPIELERAKTE' : isStaffCard ? (staffMeta?.label || 'Staff').toUpperCase() : 'GESUCH';

  return (
    <div className="tm-card tm-swipecard" style={style}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className="tm-card-top">
        <Avatar name={displayName} revealed={revealed} />
        <div className="tm-card-top-text">
          {revealed ? (
            <div className="tm-card-name">{displayName}</div>
          ) : (
            <RedactedBar label={isClubCard ? 'Vereinsname gesperrt' : 'Name gesperrt'} />
          )}
          {isPlayerCard && <div className="tm-card-sub">{age} Jahre</div>}
          {isStaffCard && <div className="tm-card-sub">{staffMeta?.label}{age != null ? ` · ${age} Jahre` : ''}</div>}
          {isClubCard && <div className="tm-card-sub">{revealed ? profile.contactPerson : ''}</div>}
        </div>
        <div className="tm-stamp">{stampLabel}</div>
      </div>

      <div className="tm-card-body">
        {(isPlayerCard || isClubCard) && (
          <PitchMini codes={isPlayerCard ? [profile.position, profile.secondaryPosition] : profile.searchedPositions} secondaryCode={isPlayerCard ? profile.secondaryPosition : null} />
        )}
        {isStaffCard && StaffIcon && <div className="tm-staff-icon-wrap"><StaffIcon size={30} /></div>}
        <div className="tm-card-facts">
          {distanceKm != null && <div className="tm-fact"><MapPin size={14} /> {Math.round(distanceKm)} km entfernt</div>}
          {isPlayerCard && (
            <>
              <div className="tm-fact-line"><span className="tm-fact-label">Position</span><span>{posByCode(profile.position)?.label} ({profile.position}){profile.secondaryPosition ? `, auch ${profile.secondaryPosition}` : ''}</span></div>
              <div className="tm-fact-line"><span className="tm-fact-label">Starker Fuß</span><span>{profile.strongFoot}</span></div>
              <BadgeRow laz={profile.laz} academy={profile.academy} />
              <div className="tm-stat-block-title">Statistik – Erwachsenenbereich ({profile.leagueAdult})</div>
              <div className="tm-statchip-row">
                <StatChip label="Einsätze" value={profile.statsAdult.einsaetze} />
                <StatChip label="Tore" value={profile.statsAdult.tore} />
                <StatChip label="Vorlagen" value={profile.statsAdult.vorlagen} />
              </div>
              {profile.leagueYouth && (
                <>
                  <div className="tm-stat-block-title">Statistik – Nachwuchs ({profile.leagueYouth})</div>
                  <div className="tm-statchip-row">
                    <StatChip label="Einsätze" value={profile.statsYouth.einsaetze} />
                    <StatChip label="Tore" value={profile.statsYouth.tore} />
                    <StatChip label="Vorlagen" value={profile.statsYouth.vorlagen} />
                  </div>
                </>
              )}
            </>
          )}
          {isClubCard && (
            <>
              {profile.searchedPositions?.length > 0 && (
                <div className="tm-fact-line"><span className="tm-fact-label">Gesuchte Position(en)</span><span>{profile.searchedPositions.join(', ')}</span></div>
              )}
              <div className="tm-fact-line"><span className="tm-fact-label">Liga</span><span>{profile.league}</span></div>
              {profile.searchedStaffTypes?.length > 0 && (
                <div className="tm-fact-line"><span className="tm-fact-label">Gesuchte Staff-Rollen</span><span>{profile.searchedStaffTypes.map(c => staffTypeByCode(c)?.label).join(', ')}</span></div>
              )}
            </>
          )}
          {isStaffCard && (
            <>
              <div className="tm-fact-line"><span className="tm-fact-label">{staffQualificationLabel(profile.staffType)}</span><span>{profile.qualification}</span></div>
              <div className="tm-fact-line"><span className="tm-fact-label">Erfahrung</span><span>{profile.yearsExperience} Jahre</span></div>
              {profile.staffType === 'physio' && profile.earliestAppointmentWeeks != null && (
                <div className="tm-fact-line"><span className="tm-fact-label">Frühester Termin</span><span>in {profile.earliestAppointmentWeeks} Wochen</span></div>
              )}
            </>
          )}
          {aeInfo && <AEBox aeInfo={aeInfo} title={aeTitle} />}
        </div>
      </div>
    </div>
  );
}

function DiscoverScreen({ myProfile, premiumDemo, deck, deckLoading, onDecide, onReload, onSeedDemo }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exitDirection, setExitDirection] = useState(null);
  const startX = useRef(0);

  const current = deck[0];

  function handlePointerDown(e) { setDragging(true); startX.current = e.clientX; e.currentTarget.setPointerCapture?.(e.pointerId); }
  function handlePointerMove(e) { if (!dragging) return; setDragX(e.clientX - startX.current); }
  function handlePointerUp() {
    setDragging(false);
    if (Math.abs(dragX) > 90) { triggerDecision(dragX > 0); } else { setDragX(0); }
  }
  function triggerDecision(liked) {
    if (!current) return;
    setExitDirection(liked ? 'right' : 'left');
    const target = current;
    setTimeout(() => { onDecide(target, liked); setExitDirection(null); setDragX(0); }, 220);
  }

  const myCoords = coordsOf(myProfile);

  return (
    <div className="tm-screen tm-discover">
      <div className="tm-discover-header">
        <h2 className="tm-h2">Entdecken</h2>
        <button className="tm-icon-btn" onClick={onReload} title="Aktualisieren"><RotateCcw size={16} /></button>
      </div>
      {premiumDemo && <div className="tm-premium-banner"><ShieldCheck size={13} /> Demo: Premium-Ansicht aktiv – Namen &amp; Fotos sind hier nur simuliert sichtbar.</div>}
      <div className="tm-deck-area">
        {deckLoading ? (
          <div className="tm-empty">Profile werden geladen …</div>
        ) : !current ? (
          <div className="tm-empty">
            <p>Keine weiteren Profile in deiner Nähe.</p>
            <p className="tm-empty-sub">Schau später wieder vorbei oder prüfe erneut.</p>
            <button className="tm-btn" onClick={onReload}>Erneut prüfen</button>
            <button className="tm-btn" onClick={onSeedDemo} style={{ marginTop: 8 }}>Demo-Profile neu mischen</button>
          </div>
        ) : (
          <>
            {deck[1] && <div className="tm-card tm-swipecard tm-swipecard--behind" />}
            <DiscoverCard
              profile={current}
              myProfile={myProfile}
              revealed={premiumDemo}
              distanceKm={haversineKm(myCoords, coordsOf(current))}
              exitDirection={exitDirection}
              dragX={dragX}
              dragging={dragging}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </>
        )}
      </div>
      {current && (
        <div className="tm-decision-row">
          <button className="tm-decision-btn tm-decision-btn--pass" onClick={() => triggerDecision(false)} aria-label="Kein Interesse"><X size={26} /></button>
          <button className="tm-decision-btn tm-decision-btn--like" onClick={() => triggerDecision(true)} aria-label="Interesse"><Heart size={24} /></button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Matches & Chat ---------------------------- */

function MatchesScreen({ matches, loading, onOpenChat }) {
  return (
    <div className="tm-screen">
      <h2 className="tm-h2">Matches</h2>
      {loading ? (
        <div className="tm-empty">Matches werden geladen …</div>
      ) : matches.length === 0 ? (
        <div className="tm-empty">
          <p>Noch keine Matches.</p>
          <p className="tm-empty-sub">Sobald du und eine Gegenseite gegenseitig Interesse zeigen, taucht der Kontakt hier auf.</p>
        </div>
      ) : (
        <ul className="tm-match-list">
          {matches.map(m => (
            <li key={m.matchId} className="tm-match-item" onClick={() => onOpenChat(m.matchId)}>
              <Avatar name={displayNameOf(m.profile)} revealed={true} size={44} />
              <div className="tm-match-item-text">
                <div className="tm-card-name">{displayNameOf(m.profile)}</div>
                <div className="tm-card-sub">
                  {m.profile.role === 'player' ? (posByCode(m.profile.position)?.label || m.profile.position)
                    : m.profile.role === 'staff' ? staffTypeByCode(m.profile.staffType)?.label
                    : m.profile.league}
                </div>
              </div>
              <MessageCircle size={18} className="tm-match-chevron" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChatScreen({ matchId, partnerProfile, myId, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);
  const isDemo = matchId.startsWith('demo-');

  useEffect(() => {
    let unsubscribe = () => {};
    (async () => {
      if (isDemo) {
        setMessages([]);
        setLoading(false);
        return;
      }
      const initial = await getMessages(matchId);
      setMessages(initial);
      setLoading(false);
      unsubscribe = subscribeMessages(matchId, (row) => {
        setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, row]));
      });
    })();
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    if (isDemo) {
      const mine = { id: 'local-' + Date.now(), sender_id: myId, text: trimmed, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, mine]);
      // Kleine simulierte Antwort, damit sich der Chat-Test lebendig anfühlt (rein clientseitig, keine echte Person)
      setTimeout(() => {
        setMessages(prev => [...prev, { id: 'local-' + Date.now() + '-r', sender_id: 'demo', text: 'Danke für deine Nachricht! (Demo-Antwort)', created_at: new Date().toISOString() }]);
      }, 1400);
    } else {
      await sendMessage(matchId, myId, trimmed);
      // Eigene Nachricht kommt auch über die Realtime-Subscription zurück; kein optimistisches Einfügen nötig.
    }
  }

  const partnerName = displayNameOf(partnerProfile);

  return (
    <div className="tm-screen tm-chat-screen">
      <div className="tm-chat-header">
        <button className="tm-icon-btn" onClick={onBack}><ChevronLeft size={18} /></button>
        <Avatar name={partnerName} revealed={true} size={36} />
        <div className="tm-card-name">{partnerName}</div>
      </div>
      <div className="tm-chat-body">
        {loading ? <div className="tm-empty">Chat wird geladen …</div> : messages.length === 0 ? (
          <div className="tm-empty tm-empty--chat">Ihr habt gematcht! Schreib die erste Nachricht.</div>
        ) : messages.map((m) => (
          <div key={m.id} className={'tm-bubble ' + (m.sender_id === myId ? 'tm-bubble--me' : 'tm-bubble--them')}>{m.text}</div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="tm-chat-input-row" onSubmit={handleSend}>
        <input className="tm-input tm-chat-input" value={text} onChange={e => setText(e.target.value)} placeholder="Nachricht schreiben …" />
        <button className="tm-icon-btn tm-icon-btn--send" type="submit"><Send size={17} /></button>
      </form>
    </div>
  );
}

/* ---------------------------- Profil-Tab ---------------------------- */

function ProfileScreen({ profile, premiumDemo, onTogglePremium, onReset, onSignOut, onAddProfile, onEditProfile, hasOtherProfiles }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const isPlayer = profile.role === 'player';
  const isStaff = profile.role === 'staff';
  const isClub = profile.role === 'club';
  const age = (isPlayer || isStaff) && profile.birthDate ? calcAge(profile.birthDate) : null;
  const mapsUrl = profile.location ? `https://www.google.com/maps?q=${profile.location.lat},${profile.location.lng}` : null;
  const staffMeta = isStaff ? staffTypeByCode(profile.staffType) : null;
  const StaffIcon = staffMeta?.icon;

  return (
    <div className="tm-screen">
      <h2 className="tm-h2">Mein Profil</h2>
      <div className="tm-card tm-card--static">
        <div className="tm-card-top">
          <Avatar name={displayNameOf(profile)} revealed={true} />
          <div className="tm-card-top-text">
            <div className="tm-card-name">{displayNameOf(profile)}</div>
            <div className="tm-card-sub">
              {isPlayer && `${age} Jahre · ${profile.location?.label}`}
              {isStaff && `${staffMeta?.label}${age != null ? ` · ${age} Jahre` : ''} · ${profile.location?.label}`}
              {isClub && `${profile.contactPerson} · ${profile.location?.label}`}
            </div>
          </div>
        </div>
        <div className="tm-card-body">
          {(isPlayer || isClub) && (
            <PitchMini codes={isPlayer ? [profile.position, profile.secondaryPosition] : profile.searchedPositions} secondaryCode={isPlayer ? profile.secondaryPosition : null} />
          )}
          {isStaff && StaffIcon && <div className="tm-staff-icon-wrap"><StaffIcon size={30} /></div>}
          <div className="tm-card-facts">
            {isPlayer && (
              <>
                <div className="tm-fact-line"><span className="tm-fact-label">Position</span><span>{posByCode(profile.position)?.label} ({profile.position})</span></div>
                <div className="tm-fact-line"><span className="tm-fact-label">Starker Fuß</span><span>{profile.strongFoot}</span></div>
                <div className="tm-fact-line"><span className="tm-fact-label">Liga (Erwachsene)</span><span>{profile.leagueAdult}</span></div>
                <div className="tm-fact-line"><span className="tm-fact-label">Fußball seit</span><span>{profile.startDate}</span></div>
                {profile.hasBreak && <div className="tm-fact-line"><span className="tm-fact-label">Pause</span><span>{profile.breakFrom} – {profile.breakTo}</span></div>}
                <BadgeRow laz={profile.laz} academy={profile.academy} />
                <div className="tm-statchip-row">
                  <StatChip label="Einsätze" value={profile.statsAdult.einsaetze} />
                  <StatChip label="Tore" value={profile.statsAdult.tore} />
                  <StatChip label="Vorlagen" value={profile.statsAdult.vorlagen} />
                </div>
              </>
            )}
            {isClub && (
              <>
                {profile.searchedPositions?.length > 0 && (
                  <div className="tm-fact-line"><span className="tm-fact-label">Gesuchte Position(en)</span><span>{profile.searchedPositions.join(', ')}</span></div>
                )}
                <div className="tm-fact-line"><span className="tm-fact-label">Liga</span><span>{profile.league}</span></div>
                {profile.searchedStaffTypes?.length > 0 && (
                  <div className="tm-fact-line"><span className="tm-fact-label">Gesuchte Staff-Rollen</span><span>{profile.searchedStaffTypes.map(c => staffTypeByCode(c)?.label).join(', ')}</span></div>
                )}
              </>
            )}
            {isStaff && (
              <>
                <div className="tm-fact-line"><span className="tm-fact-label">{staffQualificationLabel(profile.staffType)}</span><span>{profile.qualification}</span></div>
                <div className="tm-fact-line"><span className="tm-fact-label">Erfahrung</span><span>{profile.yearsExperience} Jahre</span></div>
                {profile.staffType === 'physio' && profile.earliestAppointmentWeeks != null && (
                  <div className="tm-fact-line"><span className="tm-fact-label">Frühester Termin</span><span>in {profile.earliestAppointmentWeeks} Wochen</span></div>
                )}
              </>
            )}
          </div>
        </div>
        {mapsUrl && (
          <a className="tm-maps-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={13} /> Auf Google Maps ansehen
          </a>
        )}
      </div>

      {isPlayer && (
        <div className="tm-ae-table-wrap">
          <div className="tm-fieldset-title">Ausbildungsentschädigung</div>
          <div className="tm-ae-subnote">Der Leistungsstufen-Faktor ist nur für den aufnehmenden (kaufenden) Verein relevant. Diese Tabelle zeigt dir zur Info, wie viel ein Verein – je nach seiner eigenen Leistungsstufe – für dich bezahlen müsste:</div>
          <table className="tm-ae-table">
            <tbody>
              {AUSTRIA_LEAGUES.map(lg => {
                const info = calcAusbildungsentschaedigung(profile, lg.level);
                return (
                  <tr key={lg.level}>
                    <td>{lg.label}</td>
                    <td>{info.zeroReason ? '€ 0' : formatEuro(info.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="tm-ae-caption">Schätzung auf Basis deiner Profilangaben (Beginn, Pausen, LAZ/Akademie) nach ÖFB-Regulativ, Anhang I (gültig ab 1.5.2025). Keine Rechtsauskunft – maßgeblich ist die offizielle Berechnung deines Landesverbands über „Fußball-Online".</div>
        </div>
      )}

      <div className="tm-premium-toggle-row">
        <div>
          <div className="tm-card-name">Demo: Premium-Ansicht</div>
          <div className="tm-card-sub">Zeigt simuliert, wie zahlende Nutzer Namen &amp; Fotos sehen würden. Keine echte Zahlung in diesem Prototyp.</div>
        </div>
        <button className={'tm-switch' + (premiumDemo ? ' tm-switch--on' : '')} onClick={onTogglePremium} aria-pressed={premiumDemo}>
          <span className="tm-switch-knob" />
        </button>
      </div>

      <button type="button" className="tm-link-btn" onClick={() => setShowPrivacy(true)}>Datenschutzerklärung ansehen</button>
      {showPrivacy && <PolicyOverlay onClose={() => setShowPrivacy(false)} />}

      <div className="tm-disclaimer">
        Diese Version läuft mit echtem Backend (Supabase) und echtem Login per E-Mail + Passwort. Für den vollständigen
        Betrieb fehlen noch: Vereinsverifizierung, eine Zahlungsanbindung für die Premium-Stufe, eine native App
        sowie eine juristische Prüfung der Datenschutzerklärung. Die Ausbildungsentschädigung ist eine
        vereinfachte Schätzung, keine verbindliche oder rechtliche Berechnung. Der Standort nutzt Browser-Geolocation
        und OpenStreetMap statt einer eigenen Google-Maps/Places-Anbindung.
      </div>

      <button type="button" className="tm-link-btn" onClick={onEditProfile}>Profil bearbeiten</button>

      <button type="button" className="tm-link-btn" onClick={onAddProfile}><Plus size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Weiteres Profil hinzufügen (z. B. zusätzlich als Trainer)</button>

      <button type="button" className="tm-btn" onClick={onSignOut}><LogOut size={14} /> Abmelden</button>

      {!confirmReset ? (
        <button className="tm-btn tm-btn--danger" onClick={() => setConfirmReset(true)}>
          <RotateCcw size={14} /> {hasOtherProfiles ? 'Dieses Profil löschen' : 'Profil löschen & neu starten'}
        </button>
      ) : (
        <div className="tm-confirm-row">
          <span>{hasOtherProfiles ? 'Dieses Profil wirklich löschen?' : 'Profil wirklich löschen?'}</span>
          <button className="tm-btn tm-btn--danger" onClick={onReset}>Ja, löschen</button>
          <button className="tm-btn" onClick={() => setConfirmReset(false)}>Abbrechen</button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Admin-Tab ---------------------------- */
/* Nur sichtbar/aufrufbar für ADMIN_EMAILS. Der eigentliche Zugriffsschutz
   liegt in der Datenbank (RLS-Policies + is_admin()-Check in
   admin_list_users(), siehe supabase/admin_migration.sql) - diese Ansicht
   zeigt einfach an, was die API liefert bzw. den Fehler, falls die
   Migration noch nicht eingespielt wurde. */

function AdminScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [likes, setLikes] = useState([]);
  const [matches, setMatches] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [creatingRole, setCreatingRole] = useState(null);

  async function loadAdminData() {
    setLoading(true);
    setError('');
    try {
      const [u, p, l, m, msg] = await Promise.all([
        adminListUsers(), adminListAllProfiles(), adminListAllLikes(), adminListAllMatches(), adminListAllMessages(),
      ]);
      setUsers(u); setProfiles(p); setLikes(l); setMatches(m); setMessages(msg);
    } catch (err) {
      setError(
        'Zugriff verweigert oder Fehler beim Laden. Prüfe, ob die Migrationen im SQL Editor ausgeführt wurden und deine E-Mail dort bei is_admin() hinterlegt ist.'
        + (err?.message ? `\n\nTechnische Details: ${err.message}` : '')
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAdminData(); }, []);

  async function handleCreateTestProfile(fields) {
    await adminCreateProfile(creatingRole, fields);
    setCreatingRole(null);
    setIsCreatingProfile(false);
    loadAdminData();
  }

  /* Test-Vereine/-Spieler/-Staff anlegen, die an keinem echten Konto hängen
     (user_id null - siehe adminCreateProfile in lib/api.js). Nutzt dieselben
     Formulare wie die echte Registrierung. */
  if (isCreatingProfile) {
    if (!creatingRole) {
      return <RoleSelect onSelect={setCreatingRole} onBack={() => setIsCreatingProfile(false)} />;
    }
    return <OnboardingForm role={creatingRole} onBack={() => setCreatingRole(null)} onSubmit={handleCreateTestProfile} />;
  }

  if (loading) return <div className="tm-screen"><div className="tm-empty">Admin-Daten werden geladen …</div></div>;
  if (error) return <div className="tm-screen"><div className="tm-error" style={{ whiteSpace: 'pre-line' }}>{error}</div></div>;

  const userById = new Map(users.map(u => [u.id, u]));
  const roleLabelOf = (p) => {
    if (!p?.role) return '—';
    return p.role === 'staff' ? `staff (${staffTypeByCode(p.staffType)?.label || p.staffType || '?'})` : p.role;
  };
  const likesGivenByProfile = new Map();
  likes.forEach(l => likesGivenByProfile.set(l.liker_id, (likesGivenByProfile.get(l.liker_id) || 0) + 1));
  const matchCountByProfile = new Map();
  matches.forEach(m => {
    matchCountByProfile.set(m.user_a, (matchCountByProfile.get(m.user_a) || 0) + 1);
    matchCountByProfile.set(m.user_b, (matchCountByProfile.get(m.user_b) || 0) + 1);
  });
  const messageCountByProfile = new Map();
  messages.forEach(m => messageCountByProfile.set(m.sender_id, (messageCountByProfile.get(m.sender_id) || 0) + 1));
  const profileById = new Map(profiles.map(p => [p.id, p]));

  return (
    <div className="tm-screen">
      <h2 className="tm-h2">Admin</h2>
      <button type="button" className="tm-btn" onClick={() => setIsCreatingProfile(true)}>
        <Plus size={14} /> Testprofil anlegen (Verein/Spieler/Staff, ohne echtes Konto)
      </button>
      <div className="tm-statchip-row">
        <StatChip label="Nutzer:innen" value={users.length} />
        <StatChip label="Profile" value={profiles.length} />
        <StatChip label="Likes" value={likes.length} />
        <StatChip label="Matches" value={matches.length} />
        <StatChip label="Nachrichten" value={messages.length} />
      </div>

      <div className="tm-fieldset-title">Profile (eine Person kann mehrere haben)</div>
      <div className="tm-admin-table-wrap">
        <table className="tm-admin-table">
          <thead>
            <tr><th>E-Mail</th><th>Rolle</th><th>Name</th><th>Angelegt</th><th>Likes</th><th>Matches</th><th>Nachr.</th></tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id}>
                <td>{userById.get(p.user_id)?.email || '—'}</td>
                <td>{roleLabelOf(p)}</td>
                <td>{displayNameOf(p)}</td>
                <td>{p.profileCreatedAt ? new Date(p.profileCreatedAt).toLocaleDateString('de-AT') : '—'}</td>
                <td>{likesGivenByProfile.get(p.id) || 0}</td>
                <td>{matchCountByProfile.get(p.id) || 0}</td>
                <td>{messageCountByProfile.get(p.id) || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tm-fieldset-title">Matches</div>
      {matches.length === 0 ? (
        <div className="tm-empty">Noch keine Matches.</div>
      ) : (
        <ul className="tm-match-list">
          {matches.map(m => (
            <li key={m.id} className="tm-match-item" style={{ cursor: 'default' }}>
              <div className="tm-match-item-text">
                <div className="tm-card-name">{displayNameOf(profileById.get(m.user_a))} ↔ {displayNameOf(profileById.get(m.user_b))}</div>
                <div className="tm-card-sub">{new Date(m.created_at).toLocaleString('de-AT')} · {messages.filter(msg => msg.match_id === m.id).length} Nachrichten</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------- Navigation & Overlays ---------------------------- */

function TopBar({ premiumDemo, onTogglePremium, profiles, activeProfile, onSwitchProfile, onAddProfile }) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  return (
    <div className="tm-topbar">
      <div className="tm-brand tm-brand--small"><span className="tm-brand-text">WECHSEL</span><span className="tm-brand-dot">.</span></div>
      <div className="tm-topbar-right">
        {profiles.length > 1 && (
          <div className="tm-profile-switcher">
            <button className="tm-chip" onClick={() => setSwitcherOpen(v => !v)}>
              {profileRoleLabel(activeProfile)} <ChevronDown size={12} />
            </button>
            {switcherOpen && (
              <div className="tm-profile-switcher-menu">
                {profiles.map(p => (
                  <button
                    key={p.id}
                    className={'tm-profile-switcher-item' + (p.id === activeProfile?.id ? ' tm-profile-switcher-item--active' : '')}
                    onClick={() => { onSwitchProfile(p.id); setSwitcherOpen(false); }}
                  >
                    {profileRoleLabel(p)}
                  </button>
                ))}
                <button className="tm-profile-switcher-item tm-profile-switcher-item--add" onClick={() => { onAddProfile(); setSwitcherOpen(false); }}>
                  <Plus size={12} /> Neues Profil
                </button>
              </div>
            )}
          </div>
        )}
        <button className={'tm-chip' + (premiumDemo ? ' tm-chip--active' : '')} onClick={onTogglePremium}>
          <ShieldCheck size={13} /> {premiumDemo ? 'Premium-Demo an' : 'Premium-Demo'}
        </button>
      </div>
    </div>
  );
}

function BottomNav({ screen, onChange, matchCount, isAdmin }) {
  const items = [
    { key: 'discover', label: 'Entdecken', icon: Search },
    { key: 'matches', label: 'Matches', icon: MessageCircle, badge: matchCount },
    { key: 'profile', label: 'Profil', icon: User },
  ];
  if (isAdmin) items.push({ key: 'admin', label: 'Admin', icon: ShieldAlert });
  return (
    <div className="tm-bottomnav">
      {items.map(it => {
        const Icon = it.icon;
        return (
          <button key={it.key} className={'tm-nav-btn' + (screen === it.key ? ' tm-nav-btn--active' : '')} onClick={() => onChange(it.key)}>
            <span className="tm-nav-icon-wrap"><Icon size={20} />{!!it.badge && <span className="tm-nav-badge">{it.badge}</span>}</span>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function MatchOverlay({ partner, onClose }) {
  const partnerName = displayNameOf(partner);
  return (
    <div className="tm-overlay" onClick={onClose}>
      <div className="tm-overlay-card" onClick={e => e.stopPropagation()}>
        <Sparkles size={30} />
        <div className="tm-overlay-title">Es ist ein Match!</div>
        <div className="tm-overlay-sub">{partnerName} zeigt ebenfalls Interesse. Der Chat ist jetzt freigeschaltet.</div>
        <button className="tm-btn tm-btn--primary" onClick={onClose}>Weiter</button>
      </div>
    </div>
  );
}

/* ---------------------------- Haupt-App ---------------------------- */

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(true);
  const [session, setSession] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [pendingRole, setPendingRole] = useState(null);
  const [screen, setScreen] = useState('discover');
  const [premiumDemo, setPremiumDemo] = useState(false);

  const profile = profiles.find(p => p.id === activeProfileId) || profiles[0] || null;

  function switchActiveProfile(id) {
    setActiveProfileId(id);
    try { localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id); } catch { /* z. B. Privater Modus ohne localStorage */ }
  }

  /* Demo-Spieler/-Vereine werden lokal im Browser gehalten (nicht in der
     Datenbank) – so sind sie immer verfügbar, auch bevor genug echte
     Nutzer:innen registriert sind. Sie matchen sofort bei "Interesse". */
  const [demoSeed] = useState(() => Math.random().toString(36).slice(2, 8));
  const [demoPlayers, setDemoPlayers] = useState(() => generateDemoPlayers(10, demoSeed));
  const [demoClubs, setDemoClubs] = useState(() => generateDemoClubs(10, demoSeed));
  const [demoStaff, setDemoStaff] = useState(() => generateDemoStaff(6, demoSeed));

  const [deck, setDeck] = useState([]);
  const [deckLoading, setDeckLoading] = useState(false);
  const [matchOverlay, setMatchOverlay] = useState(null);

  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [activeChatId, setActiveChatId] = useState(null);

  /* Auth-Status von Supabase laufend verfolgen (inkl. Rückkehr über den
     Bestätigungslink nach der Registrierung, der die Session automatisch
     aus der URL übernimmt). */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  /* Sobald eine Session existiert, alle Profile dieses Kontos laden (eine
     Person kann mehrere haben, z. B. Spieler- UND Trainer-Profil). */
  useEffect(() => {
    if (!session) { setProfiles([]); setActiveProfileId(null); setProfileLoading(false); return; }
    setProfileLoading(true);
    listMyProfiles(session.user.id).then(list => {
      setProfiles(list);
      setProfileLoading(false);
      if (list.length > 0) {
        let stored = null;
        try { stored = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY); } catch { /* ignore */ }
        const match = list.find(p => p.id === stored);
        setActiveProfileId(match ? match.id : list[0].id);
      }
    });
  }, [session]);

  function reshuffleDemoData() {
    const newSeed = Math.random().toString(36).slice(2, 8);
    setDemoPlayers(generateDemoPlayers(10, newSeed));
    setDemoClubs(generateDemoClubs(10, newSeed));
    setDemoStaff(generateDemoStaff(6, newSeed));
  }

  async function handleOnboardingSubmit(fields) {
    const newProfile = await createProfile(session.user.id, pendingRole, fields);
    setProfiles(prev => [...prev, newProfile]);
    switchActiveProfile(newProfile.id);
    setPendingRole(null);
    setScreen('discover');
  }

  function handleAddProfile() {
    setPendingRole(null);
    setScreen('addProfile');
  }

  function handleEditProfile() {
    setScreen('editProfile');
  }

  async function handleProfileEdit(fields) {
    const updated = await updateProfile(profile.id, fields);
    setProfiles(prev => prev.map(p => (p.id === updated.id ? updated : p)));
    setScreen('profile');
  }

  /* Wer sieht wen im Entdecken-Deck:
     - Verein <-> Spieler & Staff (alle Typen) - bestehend.
     - Spieler <-> Physio/Masseur zusätzlich zu Vereinen, aber NUR wenn der/die
       Spieler:in das im Profil angekreuzt hat (needsPhysio/needsMasseur), und
       nur die passend gesuchte Staff-Art.
     - Physio/Masseur <-> Spieler zusätzlich zu Vereinen, gespiegelt: nur
       Spieler mit passendem Bedarf. */
  function playerWantsStaff(playerProfile, staffProfile) {
    if (staffProfile.role !== 'staff') return true;
    if (staffProfile.staffType === 'physio') return Boolean(playerProfile.needsPhysio);
    if (staffProfile.staffType === 'masseur') return Boolean(playerProfile.needsMasseur);
    return false;
  }
  function staffWantsPlayer(staffProfile, playerProfile) {
    if (staffProfile.staffType === 'physio') return Boolean(playerProfile.needsPhysio);
    if (staffProfile.staffType === 'masseur') return Boolean(playerProfile.needsMasseur);
    return false;
  }

  async function loadDeck() {
    if (!profile) return;
    setDeckLoading(true);

    const isCarePlayer = profile.role === 'player' && (profile.needsPhysio || profile.needsMasseur);
    const isCareStaff = profile.role === 'staff' && ['physio', 'masseur'].includes(profile.staffType);
    const oppRoles = profile.role === 'club' ? ['player', 'staff']
      : profile.role === 'player' ? (isCarePlayer ? ['club', 'staff'] : ['club'])
      : ['club'];

    const [myLikes, myPasses] = await Promise.all([listMyLikes(profile.id), listMyPasses(profile.id)]);
    const exclude = new Set([...myLikes, ...myPasses, profile.id]);

    let storageCandidates = await listCandidates(oppRoles, [...exclude]);
    const demoPoolByRole = { player: demoPlayers, staff: demoStaff, club: demoClubs };
    let demoPool = oppRoles.flatMap(r => demoPoolByRole[r]).filter(p => !exclude.has(p.id));

    if (profile.role === 'player') {
      storageCandidates = storageCandidates.filter(c => playerWantsStaff(profile, c));
      demoPool = demoPool.filter(c => playerWantsStaff(profile, c));
    }

    if (isCareStaff) {
      const [realPlayers, demoCarePlayers] = [
        (await listCandidates(['player'], [...exclude])).filter(p => staffWantsPlayer(profile, p)),
        demoPlayers.filter(p => !exclude.has(p.id) && staffWantsPlayer(profile, p)),
      ];
      storageCandidates = [...storageCandidates, ...realPlayers];
      demoPool = [...demoPool, ...demoCarePlayers];
    }

    const seenIds = new Set();
    const candidates = [];
    for (const p of [...storageCandidates, ...demoPool]) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      candidates.push(p);
    }

    const myCoords = coordsOf(profile);
    const withDist = candidates.map(c => ({ ...c, _dist: haversineKm(myCoords, coordsOf(c)) ?? 999999 }));
    withDist.sort((a, b) => a._dist - b._dist);
    setDeck(withDist);
    setDeckLoading(false);
  }

  async function handleDecide(target, liked) {
    const isDemo = target.id.startsWith('seed-');
    if (liked) {
      if (isDemo) {
        /* Demo-Profile können nicht selbst zurück-liken – sie matchen daher
           sofort lokal, damit auch Match & Chat getestet werden können. */
        setMatchOverlay(target);
        setMatches(prev => [...prev, { matchId: 'demo-' + target.id, profile: target }]);
      } else {
        await likeUser(profile.id, target.id);
        const matchId = await findMatchId(profile.id, target.id);
        if (matchId) {
          setMatchOverlay(target);
          loadMatches();
        }
      }
    } else if (!isDemo) {
      await passUser(profile.id, target.id);
    }
    setDeck(prev => prev.filter(p => p.id !== target.id));
  }

  async function loadMatches() {
    if (!profile) return;
    setMatchesLoading(true);
    const real = await listMyMatches(profile.id);
    setMatches(prev => {
      const demoOnes = prev.filter(m => m.matchId.startsWith('demo-'));
      return [...demoOnes, ...real];
    });
    setMatchesLoading(false);
  }

  async function handleReset() {
    if (!profile) return;
    await deleteProfile(profile.id);
    const remaining = profiles.filter(p => p.id !== profile.id);
    setProfiles(remaining);
    setDeck([]); setMatches([]); setScreen('discover'); setPendingRole(null);
    if (remaining.length > 0) {
      switchActiveProfile(remaining[0].id);
    } else {
      await signOut();
      setSession(null);
      setActiveProfileId(null);
      try { localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY); } catch { /* ignore */ }
    }
  }

  async function handleSignOut() {
    await signOut();
    try { localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY); } catch { /* ignore */ }
  }

  useEffect(() => { if (profile && screen === 'discover') loadDeck(); /* eslint-disable-next-line */ }, [profile, screen, demoPlayers, demoClubs, demoStaff]);
  useEffect(() => { if (profile && screen === 'matches') loadMatches(); /* eslint-disable-next-line */ }, [profile, screen]);

  const activeChatMatch = matches.find(m => m.matchId === activeChatId) || null;
  const isAdmin = Boolean(session?.user?.email && ADMIN_EMAILS.includes(session.user.email.toLowerCase()));

  return (
    <div className="tm-root">
      <style>{CSS}</style>
      {!isSupabaseConfigured ? (
        <SetupScreen />
      ) : authLoading ? (
        <div className="tm-center-screen"><div className="tm-empty">Lädt …</div></div>
      ) : !session ? (
        showLanding ? <LandingPage onStart={() => setShowLanding(false)} /> : <LoginScreen onBack={() => setShowLanding(true)} />
      ) : profileLoading ? (
        <div className="tm-center-screen"><div className="tm-empty">Lädt …</div></div>
      ) : profiles.length === 0 ? (
        pendingRole ? (
          <OnboardingForm role={pendingRole} onBack={() => setPendingRole(null)} onSubmit={handleOnboardingSubmit} />
        ) : (
          <RoleSelect onSelect={setPendingRole} />
        )
      ) : screen === 'addProfile' ? (
        pendingRole ? (
          <OnboardingForm role={pendingRole} onBack={() => setPendingRole(null)} onSubmit={handleOnboardingSubmit} />
        ) : (
          <RoleSelect onSelect={setPendingRole} onBack={() => setScreen('profile')} />
        )
      ) : screen === 'editProfile' ? (
        <OnboardingForm role={profile.role} initialValues={profile} onBack={() => setScreen('profile')} onSubmit={handleProfileEdit} />
      ) : (
        <div className="tm-app">
          <TopBar
            premiumDemo={premiumDemo} onTogglePremium={() => setPremiumDemo(v => !v)}
            profiles={profiles} activeProfile={profile} onSwitchProfile={switchActiveProfile} onAddProfile={handleAddProfile}
          />
          <main className="tm-main">
            {screen === 'discover' && (
              <DiscoverScreen myProfile={profile} premiumDemo={premiumDemo} deck={deck} deckLoading={deckLoading} onDecide={handleDecide} onReload={loadDeck} onSeedDemo={reshuffleDemoData} />
            )}
            {screen === 'matches' && !activeChatMatch && (
              <MatchesScreen matches={matches} loading={matchesLoading} onOpenChat={setActiveChatId} />
            )}
            {screen === 'matches' && activeChatMatch && (
              <ChatScreen matchId={activeChatMatch.matchId} partnerProfile={activeChatMatch.profile} myId={profile.id} onBack={() => setActiveChatId(null)} />
            )}
            {screen === 'profile' && (
              <ProfileScreen
                profile={profile} premiumDemo={premiumDemo} onTogglePremium={() => setPremiumDemo(v => !v)}
                onReset={handleReset} onSignOut={handleSignOut} onAddProfile={handleAddProfile} onEditProfile={handleEditProfile}
                hasOtherProfiles={profiles.length > 1}
              />
            )}
            {screen === 'admin' && isAdmin && <AdminScreen />}
          </main>
          <BottomNav screen={screen} onChange={(s) => { setScreen(s); setActiveChatId(null); }} matchCount={matches.length} isAdmin={isAdmin} />
          {matchOverlay && <MatchOverlay partner={matchOverlay} onClose={() => setMatchOverlay(null)} />}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- CSS ---------------------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

:root {
  --pitch-night: #10161A;
  --chalk: #EDEDE2;
  --chalk-dim: #9EA6A0;
  --manila: #E8E1CC;
  --ink: #211D16;
  --ink-dim: #6b6455;
  --floodlight: #F4C361;
  --matchgruen: #3F8556;
  --abseits: #B6432F;
  --line: rgba(237,237,226,0.14);
}
.tm-root, .tm-root * { box-sizing: border-box; }
.tm-root {
  min-height: 100vh;
  background: radial-gradient(circle at 50% -10%, #1b2530 0%, var(--pitch-night) 55%);
  color: var(--chalk);
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.tm-app { max-width: 460px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; }
.tm-main { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.tm-screen { padding: 16px 18px 24px; display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0; }
.tm-h2 { font-family: 'Bebas Neue', sans-serif; letter-spacing: 1px; font-size: 22px; font-weight: 400; margin: 4px 0; color: var(--chalk); }

.tm-brand { display: flex; align-items: baseline; }
.tm-brand-text { font-family: 'Bebas Neue', sans-serif; font-size: 40px; letter-spacing: 3px; color: var(--chalk); }
.tm-brand--small .tm-brand-text { font-size: 22px; letter-spacing: 2px; }
.tm-brand-dot { color: var(--floodlight); font-size: 40px; margin-left: 2px; }
.tm-brand--small .tm-brand-dot { font-size: 22px; }
.tm-tagline { color: var(--chalk-dim); font-size: 14.5px; max-width: 320px; text-align: center; margin: 6px 0 28px; line-height: 1.5; }

.tm-center-screen { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; max-width: 460px; margin: 0 auto; }

.tm-landing { min-height: 100vh; max-width: 460px; margin: 0 auto; padding: 40px 20px 32px; display: flex; flex-direction: column; gap: 34px; }
.tm-landing-hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; }
.tm-landing-headline { font-family: 'Bebas Neue', sans-serif; font-size: 26px; letter-spacing: 0.5px; line-height: 1.2; color: var(--chalk); max-width: 360px; }
.tm-landing-sub { color: var(--chalk-dim); font-size: 14px; line-height: 1.55; max-width: 360px; }
.tm-landing-cta { width: 100%; max-width: 300px; margin-top: 6px; }
.tm-landing-section { display: flex; flex-direction: column; gap: 12px; }
.tm-landing-steps { display: flex; flex-direction: column; gap: 14px; }
.tm-landing-step { display: flex; gap: 12px; align-items: flex-start; }
.tm-landing-step-num {
  flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; background: rgba(244,195,97,0.12); color: var(--floodlight);
  border: 1px solid rgba(244,195,97,0.4); display: flex; align-items: center; justify-content: center;
  font-family: 'IBM Plex Mono', monospace; font-weight: 600; font-size: 12.5px;
}
.tm-landing-audience-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.tm-landing-audience-card {
  background: var(--pitch-night); border: 1px solid var(--line); border-radius: 12px; padding: 14px;
  display: flex; flex-direction: column; gap: 5px; color: var(--floodlight);
}
.tm-landing-audience-card .tm-card-name { color: var(--chalk); }
.tm-landing-features { display: flex; flex-direction: column; gap: 10px; }
.tm-landing-feature { display: flex; align-items: center; gap: 9px; font-size: 13.5px; color: var(--chalk-dim); }
.tm-landing-feature svg { color: var(--floodlight); flex-shrink: 0; }
.tm-landing-footer { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding-top: 8px; border-top: 1px dashed var(--line); }

.tm-role-cards { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 340px; }
.tm-role-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  background: var(--pitch-night); border: 1px solid var(--line); color: var(--chalk);
  border-radius: 14px; padding: 18px 20px; cursor: pointer; text-align: left;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.tm-role-card:hover { border-color: var(--floodlight); transform: translateY(-1px); }
.tm-role-title { font-weight: 600; font-size: 16px; margin-top: 4px; }
.tm-role-sub { color: var(--chalk-dim); font-size: 13px; }

.tm-back-link { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--chalk-dim); font-size: 13px; cursor: pointer; padding: 4px 0; align-self: flex-start; }

.tm-form { display: flex; flex-direction: column; gap: 12px; padding-bottom: 20px; }
.tm-label { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--chalk-dim); font-weight: 500; }
.tm-label--small { flex: 1; }
.tm-input {
  background: var(--pitch-night); border: 1px solid var(--line); color: var(--chalk);
  border-radius: 9px; padding: 10px 11px; font-size: 14.5px; font-family: 'Inter', sans-serif;
}
.tm-input:focus-visible { outline: 2px solid var(--floodlight); outline-offset: 1px; }
.tm-stat-row, .tm-date-row { display: flex; gap: 10px; }
.tm-fieldset-title { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--floodlight); margin-top: 6px; }
.tm-checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--chalk-dim); }
.tm-checkbox-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.tm-pos-check {
  display: flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 20px;
  padding: 6px 12px; font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; cursor: pointer; color: var(--chalk-dim);
}
.tm-pos-check input { display: none; }
.tm-pos-check--active { border-color: var(--floodlight); color: var(--floodlight); background: rgba(244,195,97,0.08); }
.tm-error { color: var(--abseits); font-size: 13px; }

.tm-btn {
  background: transparent; border: 1px solid var(--line); color: var(--chalk); border-radius: 10px;
  padding: 11px 16px; font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.tm-btn:focus-visible { outline: 2px solid var(--floodlight); outline-offset: 2px; }
.tm-btn--primary { background: var(--floodlight); color: #241a05; border-color: var(--floodlight); }
.tm-btn--danger { border-color: var(--abseits); color: var(--abseits); }

.tm-topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px 8px; }
.tm-topbar-right { display: flex; align-items: center; gap: 8px; }
.tm-profile-switcher { position: relative; }
.tm-profile-switcher-menu {
  position: absolute; top: calc(100% + 6px); right: 0; background: var(--pitch-night); border: 1px solid var(--line);
  border-radius: 10px; padding: 4px; display: flex; flex-direction: column; min-width: 140px; z-index: 20;
  box-shadow: 0 12px 24px -8px rgba(0,0,0,0.6);
}
.tm-profile-switcher-item {
  background: none; border: none; color: var(--chalk); font-size: 12.5px; text-align: left; padding: 8px 10px;
  border-radius: 7px; cursor: pointer; display: flex; align-items: center; gap: 6px;
}
.tm-profile-switcher-item:hover { background: rgba(237,237,226,0.06); }
.tm-profile-switcher-item--active { color: var(--floodlight); font-weight: 600; }
.tm-profile-switcher-item--add { color: var(--chalk-dim); border-top: 1px solid var(--line); margin-top: 2px; padding-top: 8px; }
.tm-chip {
  display: inline-flex; align-items: center; gap: 5px; background: var(--pitch-night); border: 1px solid var(--line);
  color: var(--chalk-dim); border-radius: 20px; padding: 6px 11px; font-size: 11.5px; cursor: pointer;
}
.tm-chip--active { border-color: var(--floodlight); color: var(--floodlight); }
.tm-premium-banner {
  display: flex; align-items: center; gap: 6px; background: rgba(244,195,97,0.1); border: 1px solid rgba(244,195,97,0.3);
  color: var(--floodlight); font-size: 12px; padding: 8px 10px; border-radius: 8px;
}

.tm-discover-header { display: flex; align-items: center; justify-content: space-between; }
.tm-icon-btn { background: var(--pitch-night); border: 1px solid var(--line); color: var(--chalk); border-radius: 9px; padding: 7px; cursor: pointer; display: inline-flex; }
.tm-icon-btn:focus-visible { outline: 2px solid var(--floodlight); }
.tm-deck-area { position: relative; flex: 1; min-height: 480px; display: flex; align-items: center; justify-content: center; }

.tm-card {
  background: var(--manila); color: var(--ink); border-radius: 18px; padding: 20px 18px 18px;
  box-shadow: 0 18px 40px -14px rgba(0,0,0,0.6); position: relative; overflow: hidden;
}
.tm-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 9px;
  background-image: radial-gradient(circle at 6px 0px, var(--pitch-night) 5px, transparent 5.5px);
  background-size: 16px 9px; background-repeat: repeat-x;
}
.tm-swipecard { position: absolute; width: 100%; max-width: 380px; cursor: grab; touch-action: none; user-select: none; max-height: 88vh; overflow-y: auto; }
.tm-swipecard--behind { transform: scale(0.96) translateY(10px); opacity: 0.6; z-index: -1; }
.tm-card--static { position: static; max-width: none; }

.tm-card-top { display: flex; align-items: flex-start; gap: 12px; padding-top: 6px; position: relative; }
.tm-card-top-text { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.tm-card-name { font-weight: 700; font-size: 16.5px; }
.tm-card-sub { color: var(--ink-dim); font-size: 12.5px; }
.tm-stamp {
  font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 1.5px; color: var(--abseits);
  border: 1.5px solid var(--abseits); border-radius: 4px; padding: 3px 6px; transform: rotate(6deg); opacity: 0.75;
}
.tm-avatar { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; flex-shrink: 0; }
.tm-avatar--locked { background: var(--ink); color: var(--manila); opacity: 0.55; }
.tm-redacted { display: flex; align-items: center; gap: 5px; background: var(--ink); color: var(--manila); font-size: 10.5px; letter-spacing: 0.5px; border-radius: 4px; padding: 4px 8px; opacity: 0.75; }

.tm-card-body { display: flex; gap: 14px; margin-top: 14px; }
.tm-pitch { width: 78px; flex-shrink: 0; }
.tm-staff-icon-wrap { width: 78px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--matchgruen); background: rgba(63,133,86,0.1); border-radius: 12px; }
.tm-pitch-outline { fill: none; stroke: rgba(33,29,22,0.35); stroke-width: 1.5; }
.tm-pitch-dot { fill: var(--matchgruen); stroke: var(--manila); stroke-width: 1.5; }
.tm-pitch-dot--secondary { fill: var(--floodlight); }
.tm-card-facts { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.tm-fact { display: flex; align-items: center; gap: 4px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--ink-dim); }
.tm-fact-line { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; border-bottom: 1px dashed rgba(33,29,22,0.15); padding-bottom: 4px; }
.tm-fact-label { color: var(--ink-dim); }
.tm-stat-block-title { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--ink-dim); margin-top: 4px; }
.tm-statchip-row { display: flex; gap: 8px; }
.tm-statchip { background: rgba(33,29,22,0.06); border-radius: 8px; padding: 6px 9px; text-align: center; flex: 1; }
.tm-statchip-value { display: block; font-family: 'IBM Plex Mono', monospace; font-weight: 600; font-size: 15px; }
.tm-statchip-label { display: block; font-size: 9.5px; color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.5px; }

.tm-badge-row { display: flex; gap: 6px; flex-wrap: wrap; }
.tm-badge { display: inline-flex; align-items: center; gap: 4px; background: rgba(63,133,86,0.12); color: var(--matchgruen); border: 1px solid rgba(63,133,86,0.35); border-radius: 20px; padding: 3px 8px; font-size: 10.5px; font-weight: 600; }

.tm-ae-box { margin-top: 8px; background: rgba(180,110,20,0.08); border: 1px solid rgba(244,195,97,0.4); border-radius: 10px; padding: 8px 10px; }
.tm-ae-title { display: flex; align-items: center; gap: 5px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink-dim); font-weight: 600; }
.tm-ae-amount { font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 17px; margin-top: 2px; }
.tm-ae-amount--zero { font-size: 14px; }
.tm-ae-reason { font-family: 'Inter', sans-serif; font-weight: 400; font-size: 11px; color: var(--ink-dim); }
.tm-ae-caption { font-size: 9.5px; color: var(--ink-dim); margin-top: 3px; line-height: 1.4; }

.tm-ae-table-wrap { background: var(--pitch-night); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.tm-ae-subnote { font-size: 12px; color: var(--chalk-dim); line-height: 1.5; margin-top: 4px; }
.tm-ae-table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 13px; }
.tm-ae-table td { padding: 5px 0; border-bottom: 1px solid var(--line); }
.tm-ae-table td:last-child { text-align: right; font-family: 'IBM Plex Mono', monospace; font-weight: 600; color: var(--floodlight); }
.tm-ae-table-wrap .tm-ae-caption { color: var(--chalk-dim); margin-top: 8px; }

.tm-location-field { display: flex; flex-direction: column; gap: 6px; }
.tm-location-row { display: flex; gap: 8px; }
.tm-location-search { flex: 1; position: relative; }
.tm-location-search .tm-input { width: 100%; }
.tm-location-searching { position: absolute; top: calc(100% + 4px); left: 0; font-size: 11px; color: var(--chalk-dim); }
.tm-location-suggestions {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--pitch-night); border: 1px solid var(--line);
  border-radius: 9px; padding: 4px; z-index: 30; max-height: 260px; overflow-y: auto; box-shadow: 0 12px 24px -8px rgba(0,0,0,0.6);
}
.tm-location-suggestion {
  display: flex; flex-direction: column; gap: 1px; width: 100%; background: none; border: none; text-align: left;
  color: var(--chalk); font-size: 12.5px; padding: 7px 9px; border-radius: 7px; cursor: pointer;
}
.tm-location-suggestion:hover { background: rgba(237,237,226,0.06); }
.tm-location-suggestion-sub { font-size: 10.5px; color: var(--chalk-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tm-geo-btn { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; background: var(--pitch-night); border: 1px solid var(--floodlight); color: var(--floodlight); border-radius: 9px; padding: 0 12px; font-size: 12px; cursor: pointer; }
.tm-location-current { font-size: 12px; color: var(--chalk-dim); }
.tm-maps-link { display: inline-flex; align-items: center; gap: 5px; margin-top: 10px; font-size: 12.5px; color: var(--floodlight); text-decoration: none; }

.tm-decision-row { display: flex; justify-content: center; gap: 22px; padding-top: 8px; }
.tm-decision-btn {
  width: 58px; height: 58px; border-radius: 50%; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 20px -6px rgba(0,0,0,0.5);
}
.tm-decision-btn--pass { background: var(--pitch-night); color: var(--abseits); border: 1.5px solid var(--abseits); }
.tm-decision-btn--like { background: var(--matchgruen); color: var(--chalk); }
.tm-decision-btn:focus-visible { outline: 2px solid var(--floodlight); outline-offset: 3px; }

.tm-empty { color: var(--chalk-dim); text-align: center; font-size: 14px; padding: 24px 10px; }
.tm-empty-sub { font-size: 12.5px; margin-top: 4px; }

.tm-admin-table-wrap { overflow-x: auto; background: var(--pitch-night); border: 1px solid var(--line); border-radius: 12px; }
.tm-admin-table { width: 100%; border-collapse: collapse; font-size: 12.5px; white-space: nowrap; }
.tm-admin-table th, .tm-admin-table td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; }
.tm-admin-table th { color: var(--chalk-dim); font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.tm-admin-table tbody tr:last-child td { border-bottom: none; }

.tm-match-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.tm-match-item { display: flex; align-items: center; gap: 12px; background: var(--pitch-night); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; cursor: pointer; }
.tm-match-item-text { flex: 1; }
.tm-match-chevron { color: var(--chalk-dim); }

.tm-chat-screen { padding: 0; }
.tm-chat-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.tm-chat-body { flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; overflow-y: auto; }
.tm-bubble { max-width: 78%; padding: 9px 12px; border-radius: 14px; font-size: 14px; line-height: 1.4; }
.tm-bubble--me { align-self: flex-end; background: var(--floodlight); color: #241a05; border-bottom-right-radius: 4px; }
.tm-bubble--them { align-self: flex-start; background: var(--pitch-night); border: 1px solid var(--line); border-bottom-left-radius: 4px; }
.tm-empty--chat { align-self: center; }
.tm-chat-input-row { display: flex; gap: 8px; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); }
.tm-chat-input { flex: 1; }
.tm-icon-btn--send { background: var(--floodlight); border-color: var(--floodlight); color: #241a05; }

.tm-premium-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--pitch-night); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.tm-switch { width: 42px; height: 24px; border-radius: 20px; background: rgba(237,237,226,0.15); border: none; cursor: pointer; position: relative; flex-shrink: 0; }
.tm-switch-knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--chalk); transition: transform 0.18s ease; }
.tm-switch--on { background: var(--floodlight); }
.tm-switch--on .tm-switch-knob { transform: translateX(18px); background: #241a05; }

.tm-disclaimer { font-size: 11.5px; color: var(--chalk-dim); line-height: 1.5; border-top: 1px dashed var(--line); padding-top: 12px; }
.tm-confirm-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }

.tm-bottomnav { display: flex; justify-content: space-around; border-top: 1px solid var(--line); padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); background: rgba(16,22,26,0.92); position: sticky; bottom: 0; }
.tm-nav-btn { background: none; border: none; color: var(--chalk-dim); font-size: 10.5px; display: flex; flex-direction: column; align-items: center; gap: 3px; cursor: pointer; padding: 4px 10px; }
.tm-nav-btn--active { color: var(--floodlight); }
.tm-nav-icon-wrap { position: relative; }
.tm-nav-badge { position: absolute; top: -4px; right: -8px; background: var(--matchgruen); color: var(--chalk); font-size: 9px; border-radius: 8px; padding: 1px 5px; }

.tm-overlay { position: fixed; inset: 0; background: rgba(16,22,26,0.82); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.tm-overlay-card { background: var(--manila); color: var(--ink); border-radius: 18px; padding: 30px 26px; max-width: 320px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.tm-overlay-card--scroll { max-width: 400px; max-height: 80vh; text-align: left; align-items: stretch; }
.tm-policy-text { overflow-y: auto; max-height: 60vh; font-size: 12.5px; line-height: 1.55; color: var(--ink-dim); padding-right: 4px; }
.tm-policy-text p { margin: 0 0 12px; }
.tm-link-btn { background: none; border: none; color: var(--floodlight); font-size: 12.5px; text-decoration: underline; cursor: pointer; padding: 2px 0; text-align: left; align-self: flex-start; }
.tm-email-gate { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 340px; background: var(--pitch-night); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin-top: 4px; }
.tm-label--wide { width: 100%; }
.tm-email-note { font-size: 10.5px; color: var(--chalk-dim); line-height: 1.4; }
.tm-divider { display: flex; align-items: center; gap: 10px; color: var(--chalk-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; width: 100%; max-width: 340px; margin: 18px 0 6px; }
.tm-divider::before, .tm-divider::after { content: ''; flex: 1; height: 1px; background: var(--line); }
.tm-overlay-title { font-family: 'Bebas Neue', sans-serif; font-size: 24px; letter-spacing: 1px; }
.tm-overlay-sub { font-size: 13.5px; color: var(--ink-dim); margin-bottom: 8px; }

@media (prefers-reduced-motion: reduce) {
  .tm-root * { transition: none !important; animation: none !important; }
}
`;
