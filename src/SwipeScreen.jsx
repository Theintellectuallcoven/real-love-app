import React, { useState, useEffect, useRef } from 'react';
import { Heart, X, Sparkles, RotateCcw, LogIn, Info, LogOut, MessageCircle, Flag, Ban, Lock, MoreHorizontal, Briefcase, HeartHandshake, MapPin, BookOpen, Globe, Landmark, Ruler } from 'lucide-react';
import SettingsScreen from './SettingsScreen';
import { PLANETS, CATEGORY, computeSynastry } from './synastry';

const GLYPH = { Sun: '☉\uFE0E', Moon: '☽\uFE0E', Mercury: '☿\uFE0E', Venus: '♀\uFE0E', Mars: '♂\uFE0E' };
function matchLabel(score) {
  if (score >= 5) return 'Cosmic Match';
  if (score === 4) return 'Strong Match';
  if (score === 3) return 'Promising Match';
  if (score === 2) return 'Mixed Signals';
  return 'Low Alignment';
}

// Free tier limits. Premium (profiles.is_premium) lifts both.
const MATCH_CAP = 3;          // open conversations at once — extra matches wait in Pending
const STARS_PER_MONTH = 3;    // shooting stars (super likes) per calendar month

// Age from a birth_date string (nearby_profiles gives age for other people, but
// your own profile row only stores birth_date, so compute it for the self view).
function calcAge(birthDateStr) {
  if (!birthDateStr) return null;
  const b = new Date(birthDateStr);
  if (isNaN(b)) return null;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age;
}

// ============================================================
// SUPABASE WIRING — same project as the signup screen.
// ============================================================
const SUPABASE_URL = 'https://rwfuttkhagijvfnphzus.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_HfNzNy0SfOOEdfbavPdrPw_KPdPPlu_';

const headers = (token) => ({
  'Content-Type': 'application/json',
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${token || SUPABASE_PUBLISHABLE_KEY}`,
});

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Sign in failed');
  return { userId: data.user.id, accessToken: data.access_token };
}

// Tells Supabase to invalidate the token server-side. Best-effort:
// even if this call fails, the app still clears local state on logout.
async function signOutRequest(token) {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: headers(token),
    });
  } catch (e) {
    // Ignore — local sign-out proceeds regardless.
  }
}

async function fetchMyProfile(userId, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, { headers: headers(token) });
  const rows = await res.json();
  if (!res.ok || !rows.length) throw new Error('Could not load your profile');
  return rows[0];
}

// Uses the nearby_profiles() Postgres function — real distance + age filtering.
async function fetchCandidates(userId, token, { maxMiles, minAge, maxAge }) {
  console.log('[DEBUG] fetchCandidates called with requesting_user_id:', userId, 'maxMiles:', maxMiles, 'minAge:', minAge, 'maxAge:', maxAge);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nearby_profiles`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      requesting_user_id: userId,
      max_miles: maxMiles,
      min_age: minAge,
      max_age: maxAge,
    }),
  });
  const data = await res.json();
  console.log('[DEBUG] nearby_profiles raw response, status:', res.status, 'body:', data);
  if (!res.ok) throw new Error(data.message || 'Could not load matches');
  return data; // [{ id, name, city, age, distance_miles, sun, moon, mercury, venus, mars, bio, hobbies }]
}

async function fetchPhotos(profileIds, token) {
  if (!profileIds.length) return {};
  const idList = profileIds.join(',');
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profile_photos?profile_id=in.(${idList})&order=position.asc&select=profile_id,photo_url,position`,
    { headers: headers(token) }
  );
  const rows = await res.json();
  const byProfile = {};
  (rows || []).forEach(r => {
    if (!byProfile[r.profile_id]) byProfile[r.profile_id] = r.photo_url;
  });
  return byProfile;
}

// All photos for one profile, in display order (used by the full profile view).
async function fetchAllPhotos(profileId, token) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profile_photos?profile_id=eq.${profileId}&order=position.asc&select=photo_url,position`,
    { headers: headers(token) }
  );
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).map(r => r.photo_url).filter(Boolean);
}

// The full profiles row for one id (includes profile_extra: prompts + details).
async function fetchFullProfile(profileId, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profileId}&select=*`, { headers: headers(token) });
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function fetchProfilesByIds(profileIds, token) {
  if (!profileIds.length) return {};
  const idList = profileIds.join(',');
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=in.(${idList})&select=*`,
    { headers: headers(token) }
  );
  const rows = await res.json();
  const byId = {};
  (rows || []).forEach(r => { byId[r.id] = r; });
  return byId;
}

async function sendLike(likerId, likedId, token, isStar = false) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/likes`, {
    method: 'POST',
    headers: { ...headers(token), Prefer: 'return=minimal' },
    body: JSON.stringify(isStar ? { liker_id: likerId, liked_id: likedId, is_star: true } : { liker_id: likerId, liked_id: likedId }),
  });
  if (!res.ok && isStar) {
    // is_star column not added yet — still send it as a normal like.
    await sendLike(likerId, likedId, token, false);
  }
}

// How many shooting stars you've sent since the 1st of this month.
async function fetchStarsUsed(myId, token) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/likes?liker_id=eq.${myId}&is_star=is.true&created_at=gte.${encodeURIComponent(monthStart)}&select=liked_id`,
      { headers: headers(token) }
    );
    const rows = await res.json();
    return Array.isArray(rows) ? rows.length : 0;
  } catch (e) { return 0; }
}

// ---- Safety: block / report / unmatch ----
// Everyone you've blocked AND everyone who blocked you — both are hidden.
async function fetchBlockedIds(myId, token) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_blocks?or=(blocker_id.eq.${myId},blocked_id.eq.${myId})&select=blocker_id,blocked_id`,
      { headers: headers(token) }
    );
    const rows = await res.json();
    const ids = new Set();
    (Array.isArray(rows) ? rows : []).forEach(r => ids.add(r.blocker_id === myId ? r.blocked_id : r.blocker_id));
    return ids;
  } catch (e) { return new Set(); }
}

async function blockUser(myId, theirId, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_blocks`, {
    method: 'POST',
    headers: { ...headers(token), Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify({ blocker_id: myId, blocked_id: theirId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Block failed (${res.status})`);
  }
}

async function reportUser(myId, theirId, reason, details, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_reports`, {
    method: 'POST',
    headers: { ...headers(token), Prefer: 'return=minimal' },
    body: JSON.stringify({ reporter_id: myId, reported_id: theirId, reason, details: details || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Report failed (${res.status})`);
  }
}

async function unmatch(matchId, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.${matchId}`, {
    method: 'PATCH',
    headers: { ...headers(token), Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'unmatched' }),
  });
  const rows = await res.json().catch(() => null);
  if (!res.ok || (Array.isArray(rows) && rows.length === 0)) {
    throw new Error((rows && rows.message) || 'Could not unmatch (run the Real Love SQL update in Supabase)');
  }
}

// The `check_mutual_like` trigger creates the matches row automatically —
// this just checks whether that row now exists for this pair.
async function checkForMatch(myId, theirId, token) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/matches?or=(and(user_a.eq.${myId},user_b.eq.${theirId}),and(user_a.eq.${theirId},user_b.eq.${myId}))&select=*`,
    { headers: headers(token) }
  );
  const rows = await res.json();
  return rows && rows.length ? rows[0] : null;
}

async function fetchMyMatches(myId, token) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/matches?or=(user_a.eq.${myId},user_b.eq.${myId})&order=created_at.asc&select=*`,
    { headers: headers(token) }
  );
  const rows = await res.json().catch(() => []);
  // Unmatched conversations are kept in the DB but hidden from both people.
  return (Array.isArray(rows) ? rows : []).filter(m => m.status !== 'unmatched');
}

// Profiles who liked YOU but you haven't matched with yet — your "Likes You" list.
// Liking one of them back completes the mutual match instantly.
async function fetchIncomingLikes(myId, token) {
  let likeRes = await fetch(`${SUPABASE_URL}/rest/v1/likes?liked_id=eq.${myId}&select=liker_id,is_star`, { headers: headers(token) });
  if (!likeRes.ok) likeRes = await fetch(`${SUPABASE_URL}/rest/v1/likes?liked_id=eq.${myId}&select=liker_id`, { headers: headers(token) });
  const likeRows = await likeRes.json();
  const rowsArr = Array.isArray(likeRows) ? likeRows : [];
  const starred = new Set(rowsArr.filter(r => r.is_star).map(r => r.liker_id));
  const likerIds = [...new Set(rowsArr.map(r => r.liker_id))];
  if (!likerIds.length) return [];
  // Any match row (even unmatched) means this like is already handled.
  const allMatchRes = await fetch(`${SUPABASE_URL}/rest/v1/matches?or=(user_a.eq.${myId},user_b.eq.${myId})&select=user_a,user_b`, { headers: headers(token) });
  const matchRows = await allMatchRes.json().catch(() => []);
  const matchedIds = new Set((Array.isArray(matchRows) ? matchRows : []).flatMap(m => [m.user_a, m.user_b]));
  const blocked = await fetchBlockedIds(myId, token);
  const pending = likerIds.filter(id => !matchedIds.has(id) && !blocked.has(id) && id !== myId);
  if (!pending.length) return [];
  const [profileMap, photoMap] = await Promise.all([
    fetchProfilesByIds(pending, token),
    fetchPhotos(pending, token),
  ]);
  return pending
    .map(id => ({ id, name: profileMap[id]?.name || 'Someone', city: profileMap[id]?.city, photoUrl: photoMap[id], _profile: profileMap[id], _star: starred.has(id) }))
    .filter(x => x._profile)
    .sort((a, b) => (b._star ? 1 : 0) - (a._star ? 1 : 0)); // shooting stars first
}

async function fetchMessages(matchId, token) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?match_id=eq.${matchId}&order=created_at.asc&select=*`,
    { headers: headers(token) }
  );
  const rows = await res.json().catch(() => []);
  // PostgREST returns an error OBJECT (not an array) if the request fails or is
  // blocked — always hand back an array so the chat never crashes on .map.
  return Array.isArray(rows) ? rows : [];
}

async function postMessage(matchId, senderId, text, token) {
  await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: 'POST',
    headers: { ...headers(token), Prefer: 'return=minimal' },
    body: JSON.stringify({ match_id: matchId, sender_id: senderId, text }),
  });
}

// Real synastry aspects (see synastry.js) — exact degrees when both charts have
// them, whole-sign aspects otherwise.
function computeMatch(myChart, theirChart) {
  return computeSynastry(myChart, theirChart);
}

// Does this candidate fit both people's "show me" choice? Unknown values pass.
function genderFits(me, them) {
  const iSeek = Array.isArray(me.seeking) ? me.seeking : [];
  const theySeek = Array.isArray(them.seeking) ? them.seeking : [];
  if (iSeek.length && them.gender && !iSeek.includes(them.gender)) return false;
  if (theySeek.length && me.gender && !theySeek.includes(me.gender)) return false;
  return true;
}

function heightLabel(p) {
  return p && p.height_feet != null ? `${p.height_feet}'${p.height_inches || 0}"` : null;
}

// ============================================================
// SIGNATURE VISUALS
// ============================================================
function ZodiacWheel({ size = 240, opacity = 1, spin = false }) {
  const zodiac = ['♈\uFE0E','♉\uFE0E','♊\uFE0E','♋\uFE0E','♌\uFE0E','♍\uFE0E','♎\uFE0E','♏\uFE0E','♐\uFE0E','♑\uFE0E','♒\uFE0E','♓\uFE0E'];
  const planets = ['☉\uFE0E','☽\uFE0E','☿\uFE0E','♀\uFE0E','♂\uFE0E']; // Sun, Moon, Mercury, Venus, Mars — the synastry planets
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ opacity, animation: spin ? 'wheelspin 120s linear infinite' : 'none' }}>
      <defs>
        <linearGradient id="zodiacGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8A6524" />
          <stop offset="35%" stopColor="#C9973F" />
          <stop offset="55%" stopColor="#F7E7BC" />
          <stop offset="75%" stopColor="#C9973F" />
          <stop offset="100%" stopColor="#8A6524" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="94" fill="none" stroke="url(#zodiacGold)" strokeWidth="0.7" />
      <circle cx="100" cy="100" r="78" fill="none" stroke="url(#zodiacGold)" strokeWidth="0.5" opacity="0.7" />
      <circle cx="100" cy="100" r="52" fill="none" stroke="url(#zodiacGold)" strokeWidth="0.5" opacity="0.55" />
      {/* Outer ring — the 12 zodiac signs, in gold */}
      {zodiac.map((g, i) => {
        const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const x = 100 + 86 * Math.cos(angle), y = 100 + 86 * Math.sin(angle);
        return <text key={'z' + i} x={x} y={y} fill="url(#zodiacGold)" fontSize="10" textAnchor="middle" dominantBaseline="middle">{g}</text>;
      })}
      {/* Inner ring — the 5 synastry planets (Sun, Moon, Mercury, Venus, Mars) */}
      {planets.map((g, i) => {
        const angle = (i / planets.length) * Math.PI * 2 - Math.PI / 2;
        const x = 100 + 38 * Math.cos(angle), y = 100 + 38 * Math.sin(angle);
        return <text key={'p' + i} x={x} y={y} fill="url(#zodiacGold)" fontSize="13" textAnchor="middle" dominantBaseline="middle">{g}</text>;
      })}
      {/* Center star */}
      <text x="100" y="100" fill="url(#zodiacGold)" fontSize="12" textAnchor="middle" dominantBaseline="middle">✦</text>
    </svg>
  );
}

// A scattered field of stars for the backdrop — fixed seed so it doesn't
// re-shuffle on every render. Positions in %, sizes in px.
const STAR_FIELD = [
  { x: 8, y: 6, s: 2.5, g: '✦', o: 0.5 }, { x: 22, y: 14, s: 1.5, g: '·', o: 0.4 },
  { x: 37, y: 5, s: 2, g: '✧', o: 0.45 }, { x: 54, y: 11, s: 1.5, g: '·', o: 0.35 },
  { x: 68, y: 4, s: 2.5, g: '✦', o: 0.5 }, { x: 83, y: 9, s: 1.5, g: '·', o: 0.4 },
  { x: 93, y: 17, s: 2, g: '✧', o: 0.45 }, { x: 4, y: 24, s: 1.5, g: '·', o: 0.35 },
  { x: 15, y: 33, s: 2, g: '✧', o: 0.4 }, { x: 90, y: 30, s: 2.5, g: '✦', o: 0.5 },
  { x: 6, y: 46, s: 2, g: '✦', o: 0.45 }, { x: 96, y: 44, s: 1.5, g: '·', o: 0.35 },
  { x: 11, y: 60, s: 2.5, g: '✧', o: 0.45 }, { x: 92, y: 58, s: 2, g: '✦', o: 0.5 },
  { x: 5, y: 74, s: 1.5, g: '·', o: 0.35 }, { x: 88, y: 72, s: 2, g: '✧', o: 0.4 },
  { x: 18, y: 86, s: 2.5, g: '✦', o: 0.5 }, { x: 34, y: 93, s: 1.5, g: '·', o: 0.4 },
  { x: 52, y: 88, s: 2, g: '✧', o: 0.45 }, { x: 70, y: 94, s: 2.5, g: '✦', o: 0.5 },
  { x: 84, y: 87, s: 1.5, g: '·', o: 0.35 }, { x: 47, y: 3, s: 1.5, g: '·', o: 0.4 },
];

// Large faint gold hearts drifting behind the deck — a couple anchored off the
// corners plus a few mid-size ones tucked into the margins. Low-opacity so cards pop.
const HEART_DECOR = [
  { rx: -120, y: -110, s: 300, o: 0.09, dur: 24 },   // big, off top-right
  { x: -110, by: -110, s: 240, o: 0.08, dur: 28 },   // big, off bottom-left
  { x: '8%', y: '30%', s: 46, o: 0.10, dur: 22 },
  { rx: '10%', y: '52%', s: 40, o: 0.09, dur: 26 },
  { x: '16%', by: '16%', s: 34, o: 0.08, dur: 30 },
];

// Faint drifting planet glyphs, low-opacity, tucked into the margins.
const PLANET_DECOR = [
  { x: 12, y: 20, s: 26, g: '♀\uFE0E', o: 0.07, dur: 26 },
  { x: 86, y: 40, s: 30, g: '♂\uFE0E', o: 0.07, dur: 32 },
  { x: 8, y: 66, s: 24, g: '☿\uFE0E', o: 0.06, dur: 29 },
  { x: 90, y: 80, s: 34, g: '☽\uFE0E', o: 0.08, dur: 35 },
];

// Celestial decorative backdrop — sits behind the deck at zIndex 0. Two faint
// spinning zodiac wheels, a scattered gold star field, drifting planet glyphs,
// and a soft radial gold glow. Kept very low-opacity so the cards still pop.
function CelestialBackdrop() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden',
      pointerEvents: 'none',
      background: 'radial-gradient(120% 90% at 50% 8%, rgba(201,151,63,0.10) 0%, rgba(201,151,63,0.03) 30%, rgba(0,0,0,0) 62%)',
    }}>
      {/* Tablet / desktop only: big faint gold zodiac wheels filling the side margins */}
      <div className="rl-wide-only" style={{ position: 'absolute', top: '50%', left: -170, transform: 'translateY(-50%)', opacity: 0.12 }}>
        <ZodiacWheel size={520} spin />
      </div>
      <div className="rl-wide-only" style={{ position: 'absolute', top: '50%', right: -170, transform: 'translateY(-50%)', opacity: 0.12 }}>
        <ZodiacWheel size={520} spin />
      </div>
      {/* Large faint gold hearts drifting behind the deck */}
      {HEART_DECOR.map((h, i) => (
        <div key={'hd' + i} style={{
          position: 'absolute', left: h.x, right: h.rx, top: h.y, bottom: h.by,
          opacity: h.o, animation: `celestialDrift ${h.dur}s ease-in-out ${i * 1.5}s infinite`,
        }}>
          <Heart size={h.s} fill="#c9973f" color="#f0d799" style={{ filter: 'drop-shadow(0 0 14px rgba(201,151,63,0.35))' }} />
        </div>
      ))}
      {/* Drifting planet glyphs */}
      {PLANET_DECOR.map((p, i) => (
        <span key={'pd' + i} style={{
          position: 'absolute', left: p.x + '%', top: p.y + '%',
          fontSize: p.s, color: '#c9a24d', opacity: p.o,
          animation: `celestialDrift ${p.dur}s ease-in-out ${i * 2}s infinite`,
        }}>{p.g}</span>
      ))}
      {/* Scattered gold star field */}
      {STAR_FIELD.map((st, i) => (
        <span key={'st' + i} style={{
          position: 'absolute', left: st.x + '%', top: st.y + '%',
          fontSize: st.s * 6, lineHeight: 1, color: '#f0d799', opacity: st.o,
          animation: `starTwinkle ${3 + (i % 4)}s ease-in-out ${(i % 5) * 0.4}s infinite`,
        }}>{st.g}</span>
      ))}
    </div>
  );
}

// Official Real Love crown — matches the waitlist logo exactly (three-orb crown
// with a heart cut out of the center, metallic gold foil gradient). `bg` is the
// color that shows through the heart cutout; default matches the app background.
function Crown({ size = 22, bg = '#000000' }) {
  return (
    <svg width={size} height={size * 0.65} viewBox="0 0 120 78" fill="none">
      <defs>
        <linearGradient id="rlCrownFoil" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#8A6524" />
          <stop offset="30%" stopColor="#C9973F" />
          <stop offset="52%" stopColor="#F7E7BC" />
          <stop offset="72%" stopColor="#C9973F" />
          <stop offset="100%" stopColor="#8A6524" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="7" r="5.4" fill="url(#rlCrownFoil)" />
      <circle cx="14" cy="20" r="4.4" fill="url(#rlCrownFoil)" />
      <circle cx="106" cy="20" r="4.4" fill="url(#rlCrownFoil)" />
      <path fill="url(#rlCrownFoil)" d="M14 24 L36 52 L60 15 L84 52 L106 24 L102 70 Q60 78 18 70 Z" />
      <path fill={bg} d="M60 44c-3.4-4-9-2.6-9 2.2 0 4 5.2 7.4 9 10.2 3.8-2.8 9-6.2 9-10.2 0-4.8-5.6-6.2-9-2.2z" />
    </svg>
  );
}

function LoginScreen({ onLogin, onGoToSignup }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const submit = async () => {
    setStatus('loading'); setError('');
    try {
      const session = await signIn(email, password);
      onLogin(session);
    } catch (e) {
      setStatus('error'); setError(e.message);
    }
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#000000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Montserrat', system-ui, sans-serif", overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Montserrat:wght@400;500;600&family=Dancing+Script:wght@600&display=swap');
        @keyframes wheelspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      {/* the Real Love couple photo (same as signup + waitlist), darkened so the form reads */}
      <div style={{ position: 'absolute', inset: 0, background: 'center 20%/cover no-repeat url(/couple-hero.png)', opacity: 0.32, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.82) 45%, #000000 85%)', pointerEvents: 'none' }} />
      {/* celestial glow + faint wheel behind the sign-in card */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(110% 80% at 50% 12%, rgba(201,151,63,0.16), rgba(0,0,0,0) 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: -110, left: '50%', transform: 'translateX(-50%)', opacity: 0.1, pointerEvents: 'none' }}><ZodiacWheel size={420} spin /></div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Crown size={48} />
      <div style={{ fontFamily: 'Cinzel, serif', color: '#ffffff', fontSize: 19, letterSpacing: 4, marginTop: 12 }}>REAL LOVE</div>
      <div style={{ color: '#bdbdbd', fontSize: 13.7, fontStyle: 'italic', fontFamily: "'Cormorant Garamond', serif", marginTop: 6, marginBottom: 6, maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>
        Real Love matches you using the placements in your birth chart — real cosmic compatibility, not guesswork.
      </div>
      <div style={{ color: '#8f8f8f', fontSize: 11.5, fontFamily: 'Cinzel, serif', letterSpacing: 1, marginBottom: 28 }}>SIGN IN TO SEE YOUR MATCHES</div>

      <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} style={inputStyle} />
        {status === 'error' && <div style={{ color: '#ffffff', fontSize: 12 }}>{error}</div>}
        <button className="rl-actionbtn" onClick={submit} disabled={status === 'loading' || !email || !password} style={{
          background: 'linear-gradient(135deg, #f7e7bc, #c9973f)', border: '1px solid rgba(247,231,188,0.7)', color: '#000000', fontWeight: 700,
          fontFamily: 'Cinzel, serif', fontSize: 13, letterSpacing: 1.5, padding: '14px 0', borderRadius: 28,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 10px 26px rgba(201,151,63,0.5), inset 0 1px 0 rgba(255,255,255,0.4)',
        }}>
          <LogIn size={15} /> {status === 'loading' ? 'SIGNING IN...' : 'SIGN IN'}
        </button>
        <div style={{ color: '#7a7a7a', fontSize: 11, textAlign: 'center', marginTop: 4 }}>
          Use the email + password from your Real Love signup.<button onClick={onGoToSignup} style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', color: '#c9a24d', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Don't have an account? Sign Up</button>
        </div>
      </div>
      </div>
    </div>
  );
}

// ============================================================
// FULL PROFILE VIEW — opened from the ⓘ button on a card.
// Shows photo, name/age, city/distance, bio, hobbies, placements.
// ============================================================
// A single prompt card (Hinge-style): small gold label, a thin gold rule, then a
// big clean serif answer with generous whitespace for a premium, high-polish feel.
function PromptCard({ question, answer }) {
  return (
    <div style={{
      background: 'linear-gradient(158deg, #141414 0%, #050505 100%)',
      border: '1px solid rgba(201,162,77,0.3)', borderRadius: 18,
      padding: '26px 24px 32px', margin: '16px 0',
      boxShadow: '0 16px 40px -10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(247,231,188,0.12)',
    }}>
      <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 10.5, letterSpacing: 2.5, textTransform: 'uppercase', opacity: 0.92 }}>{question}</div>
      <div style={{ width: 28, height: 1.5, background: 'linear-gradient(90deg, #e8c37a, rgba(201,162,77,0))', margin: '11px 0 14px', borderRadius: 2 }} />
      <div style={{ fontFamily: "'Cormorant Garamond', serif", color: '#ffffff', fontSize: 30.8, fontWeight: 600, lineHeight: 1.3, letterSpacing: 0.2, whiteSpace: 'pre-wrap' }}>{answer}</div>
    </div>
  );
}

// A big full-width photo card with a gold frame (Hinge stacks these), matched to
// the prompt cards' radius/shadow for a clean, consistent, premium feel.
function PhotoCard({ url, children }) {
  return (
    <div style={{
      position: 'relative', borderRadius: 18, overflow: 'hidden', margin: '16px 0',
      border: '1.5px solid rgba(240,215,153,0.55)',
      boxShadow: '0 18px 44px -12px rgba(0,0,0,0.6), 0 0 26px rgba(201,162,77,0.16), inset 0 1px 0 rgba(247,231,188,0.2)',
    }}>
      <div style={{
        width: '100%', aspectRatio: '4 / 5',
        background: url ? `center/cover no-repeat url(${url})` : 'linear-gradient(160deg,#1a1a1a,#2a2a2a)',
      }}>
        {/* thin inner gold hairline for a jewelled frame */}
        <div style={{ position: 'absolute', inset: 4, borderRadius: 14, border: '1px solid rgba(240,215,153,0.35)', pointerEvents: 'none' }} />
        {children}
      </div>
    </div>
  );
}

function ProfileModal({ profile, onClose, onBlock, onReport }) {
  const photos = (profile._photos && profile._photos.length)
    ? profile._photos
    : (profile.photoUrl ? [profile.photoUrl] : []);
  const extra = profile.profile_extra || {};
  const prompts = (extra.prompts || []).filter(p => p && p.question && (p.answer || '').trim());
  const details = extra.details || {};

  // Build the details rows (only the ones that have a value).
  const detailRows = [
    [Briefcase, details.job],
    [HeartHandshake, details.lookingFor],
    [MapPin, profile.city],
    [BookOpen, details.religion],
    [Globe, details.ethnicity],
    [Landmark, details.politics],
    [Ruler, heightLabel(profile)],
  ].filter(([, v]) => v);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000', zIndex: 60, overflowY: 'auto' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', minHeight: '100vh', position: 'relative', padding: '0 16px 46px' }}>
        <button onClick={onClose} style={{
          position: 'fixed', top: 18, right: 18, zIndex: 61, width: 38, height: 38, borderRadius: '50%',
          background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(201,162,77,0.5)', color: '#c9a24d',
          fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>

        {/* REAL LOVE logo lockup */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 26, marginBottom: 4 }}>
          <Crown size={30} />
          <span style={{ fontFamily: 'Cinzel, serif', color: '#ffffff', fontSize: 15, letterSpacing: 4 }}>REAL LOVE</span>
        </div>

        {/* First photo — carries the name / age / location overlay */}
        <PhotoCard url={photos[0]}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #000000, rgba(0,0,0,0) 45%)' }} />
          <div style={{ position: 'absolute', bottom: 16, left: 18, right: 18 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", color: '#ffffff', fontSize: 34.2, fontWeight: 600 }}>{profile.name}{profile.age ? `, ${profile.age}` : ''}</div>
            <div style={{ color: '#ffffff', fontSize: 13, marginTop: 2 }}>{profile.city}{profile.distance_miles != null ? ` · ${profile.distance_miles} mi away` : ''}</div>
          </div>
        </PhotoCard>

        {/* Match alignment (for other people's profiles) */}
        {!profile._isMe && profile._score != null && (
          <div style={{ textAlign: 'center', fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 11, letterSpacing: 2, margin: '6px 0 4px' }}>
            {matchLabel(profile._score).toUpperCase()} · {profile._score}/5 ALIGNED
          </div>
        )}

        {/* Details card */}
        {detailRows.length > 0 && (
          <div style={{ background: 'linear-gradient(158deg, #141414, #050505)', border: '1px solid rgba(201,162,77,0.3)', borderRadius: 18, padding: '6px 20px', margin: '14px 0', boxShadow: '0 16px 40px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(247,231,188,0.1)' }}>
            {detailRows.map(([Icon, val], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < detailRows.length - 1 ? '1px solid rgba(201,162,77,0.15)' : 'none' }}>
                <span style={{ width: 20, display: 'flex', justifyContent: 'center' }}><Icon size={16} color="#c9a24d" strokeWidth={1.6} /></span>
                <span style={{ color: '#ffffff', fontFamily: "'Cormorant Garamond', serif", fontSize: 17.1 }}>{val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Bio */}
        {profile.bio && <PromptCard question="MY VIBE" answer={profile.bio} />}

        {/* Interleave the remaining photos with the prompt cards, Hinge-style */}
        {Array.from({ length: Math.max(photos.length - 1, prompts.length) }).map((_, i) => (
          <React.Fragment key={i}>
            {prompts[i] && <PromptCard question={prompts[i].question} answer={prompts[i].answer} />}
            {photos[i + 1] && <PhotoCard url={photos[i + 1]} />}
          </React.Fragment>
        ))}

        {/* Hobbies */}
        {profile.hobbies && profile.hobbies.length > 0 && (
          <div style={{ margin: '18px 4px' }}>
            <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>HOBBIES</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {profile.hobbies.map(h => (
                <span key={h} style={{ border: '1px solid rgba(240,215,153,0.45)', background: 'linear-gradient(135deg, rgba(20,20,20,0.9), rgba(8,8,8,0.9))', color: '#f0d799', borderRadius: 20, padding: '6px 14px', fontSize: 12, boxShadow: 'inset 0 1px 0 rgba(247,231,188,0.12)' }}>{h}</span>
              ))}
            </div>
          </div>
        )}

        {/* Astrology chart */}
        {profile._breakdown && (
          <div style={{ margin: '18px 4px 0' }}>
            <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>
              {profile._isMe ? 'YOUR CHART' : 'PLACEMENTS'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {profile._breakdown.map(b => (
                <div key={b.planet} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13 }}>
                  <span style={{ color: '#ffffff' }}>{GLYPH[b.planet]} {b.category}</span>
                  {profile._isMe ? (
                    <span style={{ color: '#c9a24d', fontSize: 12 }}>{b.matchSign || '—'}</span>
                  ) : (
                    <span style={{ color: b.hit ? '#c9a24d' : '#9e9e9e', fontSize: 12 }}>{b.matchSign || '—'} · {b.hit ? '✓ aligned' : '○ friction'}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How your charts connect — the actual synastry aspects */}
        {!profile._isMe && profile._breakdown && profile._breakdown.some(b => b.aspects && b.aspects.length) && (
          <div style={{ background: 'linear-gradient(158deg, #141414, #050505)', border: '1px solid rgba(201,162,77,0.3)', borderRadius: 18, padding: '18px 20px', margin: '18px 0 0', boxShadow: '0 16px 40px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(247,231,188,0.1)' }}>
            <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>HOW YOUR CHARTS CONNECT</div>
            {profile._breakdown.map(b => (b.aspects || []).length > 0 && (
              <div key={b.planet} style={{ marginBottom: 12 }}>
                <div style={{ color: '#ffffff', fontSize: 12.5, marginBottom: 4 }}>{GLYPH[b.planet]} {b.category}</div>
                {b.aspects.map((a, i) => (
                  <div key={i} style={{ color: a.good ? '#f0d799' : '#9e9e9e', fontSize: 13.7, fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', paddingLeft: 18, lineHeight: 1.6 }}>
                    {a.good ? '✦' : '○'} {a.text}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Safety — block / report (other people only) */}
        {!profile._isMe && profile.id && (onBlock || onReport) && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 22, marginTop: 30 }}>
            {onReport && <button onClick={() => onReport(profile)} style={safetyLinkStyle}><Flag size={13} /> REPORT</button>}
            {onBlock && <button onClick={() => onBlock(profile)} style={safetyLinkStyle}><Ban size={13} /> BLOCK</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function SwipeCard({ profile, onSwipe, isTop, zIndex, onViewProfile, fling }) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [expanded, setExpanded] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });

  const start = (x, y) => { if (!isTop) return; startRef.current = { x, y }; setDrag(d => ({ ...d, active: true })); };
  const move = (x, y) => { if (!drag.active || !isTop) return; setDrag({ x: x - startRef.current.x, y: y - startRef.current.y, active: true }); };
  const end = () => {
    if (!isTop) return;
    if (Math.abs(drag.x) > 110) onSwipe(drag.x > 0 ? 'right' : 'left');
    setDrag({ x: 0, y: 0, active: false });
  };

  // `fling` is set by the parent when the ✕ / ♥ buttons are pressed, so the card
  // physically flies off to the left (pass) or right (like) — same as a drag.
  const isFlung = !!fling && isTop;
  const flungX = fling === 'right' ? 720 : fling === 'left' ? -720 : 0;
  const rotate = drag.x / 18;
  const likeOp = isFlung ? (fling === 'right' ? 1 : 0) : Math.min(Math.max(drag.x / 100, 0), 1);
  const passOp = isFlung ? (fling === 'left' ? 1 : 0) : Math.min(Math.max(-drag.x / 100, 0), 1);

  return (
    <div
      onMouseDown={e => start(e.clientX, e.clientY)}
      onMouseMove={e => move(e.clientX, e.clientY)}
      onMouseUp={end}
      onMouseLeave={() => drag.active && end()}
      onTouchStart={e => start(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchMove={e => move(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={end}
      style={{
        position: 'absolute', inset: 0, zIndex,
        transform: isFlung
          ? `translate(${flungX}px, -60px) rotate(${flungX / 18}deg)`
          : `translate(${drag.x}px, ${drag.y}px) rotate(${rotate}deg)`,
        transition: isFlung ? 'transform 0.34s ease-out' : (drag.active ? 'none' : 'transform 0.4s cubic-bezier(.2,.8,.2,1)'),
        cursor: isTop ? (drag.active ? 'grabbing' : 'grab') : 'default', touchAction: 'none',
      }}
    >
    <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', zIndex: 5, background: '#000000', padding: '0 12px', borderRadius: 12 }}>
        <Crown size={28} />
      </div>
      {/* Soft gold aura sitting just behind the card for depth */}
      <div style={{ position: 'absolute', inset: -2, borderRadius: 24, background: 'linear-gradient(150deg, rgba(232,195,122,0.55), rgba(138,101,36,0.25) 55%, rgba(201,162,77,0.4))', filter: 'blur(0.5px)' }} />
      <div style={{
        width: '100%', height: '100%', borderRadius: 22, overflow: 'hidden', position: 'relative',
        background: profile.photoUrl ? `center/cover no-repeat url(${profile.photoUrl})` : 'linear-gradient(160deg,#1a1a1a,#2a2a2a)',
        border: '1.5px solid rgba(240,215,153,0.55)',
        boxShadow: '0 2px 0 rgba(247,231,188,0.25) inset, 0 30px 60px -18px rgba(0,0,0,0.85), 0 0 30px rgba(201,162,77,0.22)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
        <div style={{ position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)' }}>
          <ZodiacWheel size={220} opacity={0.14} />
        </div>

        {/* subtle top vignette so the top-right controls stay legible on bright photos */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '32%', background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0))', pointerEvents: 'none' }} />

        <div style={{ position: 'absolute', top: 22, left: 22, padding: '6px 14px', borderRadius: 6, border: '1px solid #f0d799', color: '#000000', background: 'linear-gradient(135deg, #f7e7bc, #c9973f)', fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: 11, letterSpacing: 2, opacity: likeOp, boxShadow: '0 6px 18px rgba(201,151,63,0.5)', transform: `rotate(-7deg) scale(${0.9 + likeOp * 0.1})` }}>ALIGNED</div>
        <div style={{ position: 'absolute', top: 22, right: 22, padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.9)', color: '#e6ddd0', background: 'rgba(12,12,12,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: 11, letterSpacing: 2, opacity: passOp, transform: `rotate(7deg) scale(${0.9 + passOp * 0.1})` }}>PASS</div>

        <button onClick={() => setExpanded(s => !s)} style={{
          position: 'absolute', top: 18, right: 18, background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(240,215,153,0.55)',
          borderRadius: 22, padding: '6px 15px', color: '#f0d799', fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        }}>{profile._score}/5</button>

        <button
          onClick={(e) => { e.stopPropagation(); onViewProfile(profile); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 60, right: 18, width: 34, height: 34, borderRadius: '50%',
            background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(240,215,153,0.55)', color: '#f0d799',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
          }}
          title={`View ${profile.name}'s profile`}
        ><Info size={16} /></button>

        <div style={{ padding: '30px 22px 24px', background: 'linear-gradient(to top, rgba(0,0,0,0.96) 8%, rgba(0,0,0,0.7) 42%, rgba(0,0,0,0) 80%)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", color: '#ffffff', fontSize: 30.8, fontWeight: 600, letterSpacing: 0.3, textShadow: '0 2px 12px rgba(0,0,0,0.7)' }}>{profile.name}{profile.age ? `, ${profile.age}` : ''}</div>
            <div style={{
              fontFamily: 'Cinzel, serif', color: '#000000', fontSize: 10, letterSpacing: 1.5,
              fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
              background: 'linear-gradient(135deg, #f7e7bc, #d8ad55)', border: '1px solid rgba(247,231,188,0.6)',
              borderRadius: 20, padding: '4px 11px', boxShadow: '0 4px 12px rgba(201,151,63,0.4)',
            }}>{matchLabel(profile._score).toUpperCase()}</div>
          </div>

          <div style={{ color: '#ffffff', fontSize: 12.5, marginTop: 4, letterSpacing: 0.3, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{profile.city}{profile.distance_miles != null ? ` · ${profile.distance_miles} mi away` : ''}{heightLabel(profile) ? ` · ${heightLabel(profile)}` : ''}</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 14 }}>
            {profile._breakdown.map(b => (
              <div key={b.planet} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, color: b.hit ? '#c9a24d' : 'rgba(242,237,226,0.3)' }}>{GLYPH[b.planet]}</div>
                <div style={{ fontSize: 8.5, color: '#bdbdbd', marginTop: 2 }}>{(b.matchSign || '').slice(0, 3).toUpperCase()}</div>
              </div>
            ))}
          </div>

          {expanded && (
            <div style={{ marginTop: 14, borderTop: '1px solid rgba(201,162,77,0.25)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {profile._breakdown.map(b => {
                const lead = (b.aspects || []).find(a => a.good === b.hit) || (b.aspects || [])[0];
                return (
                  <div key={b.planet}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ color: '#ffffff' }}>{b.category}</span>
                      <span style={{ color: b.hit ? '#c9a24d' : '#9e9e9e', fontSize: 11 }}>{b.hit ? '✓ aligned' : '○ friction'}</span>
                    </div>
                    {lead && <div style={{ color: '#9e9e9e', fontSize: 10.5, fontStyle: 'italic', marginTop: 1 }}>{lead.text}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Floating gold hearts that drift up across the match celebration.
function GoldHeartsRain({ count = 16 }) {
  // Positions/sizes/timings are randomized once per mount so it feels organic.
  const hearts = Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100,
    size: 12 + Math.random() * 22,
    dur: 3.2 + Math.random() * 3.5,
    delay: Math.random() * 3.5,
    key: i,
  }));
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {hearts.map(h => (
        <div key={h.key} style={{
          position: 'absolute', left: `${h.left}%`, bottom: -40,
          animation: `rlHeartFloat ${h.dur}s linear ${h.delay}s infinite`,
        }}>
          <Heart size={h.size} fill="#e8c37a" color="#f0d799" style={{ filter: 'drop-shadow(0 0 6px rgba(232,195,122,0.65))' }} />
        </div>
      ))}
    </div>
  );
}

// Branded "REAL LOVE" match celebration — crown + wordmark, both photos with a
// gold heart between them, and a shower of gold hearts.
// A few gold shooting stars streaking across the match celebration.
function ShootingStars({ count = 5 }) {
  const stars = Array.from({ length: count }, (_, i) => ({
    top: 5 + Math.random() * 45, left: 30 + Math.random() * 70,
    delay: i * 0.9 + Math.random() * 0.6, dur: 1.4 + Math.random() * 0.8, key: i,
  }));
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {stars.map(st => (
        <div key={st.key} style={{
          position: 'absolute', top: `${st.top}%`, left: `${st.left}%`, width: 130, height: 2,
          background: 'linear-gradient(90deg, rgba(247,231,188,0), #f7e7bc 80%, #fff)',
          borderRadius: 2, boxShadow: '0 0 8px rgba(247,231,188,0.8)', opacity: 0,
          animation: `rlShootingStar ${st.dur}s ease-out ${st.delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

function MatchModal({ profile, myPhotoUrl, pending, onMessage, onKeepBrowsing }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', overflow: 'hidden' }}>
      <style>{`
        @keyframes rlHeartFloat { 0% { transform: translateY(0) rotate(0deg); opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { transform: translateY(-108vh) rotate(18deg); opacity: 0; } }
        @keyframes rlMatchPop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes rlShootingStar { 0% { transform: translate(0,0) rotate(-28deg) scaleX(0.3); opacity: 0; } 15% { opacity: 1; } 70% { opacity: 1; } 100% { transform: translate(-360px,190px) rotate(-28deg) scaleX(1); opacity: 0; } }
      `}</style>
      <div style={{ position: 'absolute', opacity: 0.18 }}><ZodiacWheel size={360} spin /></div>
      <ShootingStars />
      <GoldHeartsRain />

      <div style={{ position: 'relative', zIndex: 1, animation: 'rlMatchPop 0.5s ease-out' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginBottom: 12 }}>
          <Crown size={46} bg="#080406" />
          <div style={{ fontFamily: 'Cinzel, serif', color: '#ffffff', fontSize: 22, letterSpacing: 6 }}>REAL LOVE</div>
        </div>
        <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 11.5, letterSpacing: 4, marginBottom: 20 }}>THE STARS ALIGNED</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ width: 92, height: 92, borderRadius: '50%', marginRight: -14, background: myPhotoUrl ? `center/cover no-repeat url(${myPhotoUrl})` : 'linear-gradient(160deg,#1a1a1a,#2a2a2a)', border: '2px solid #c9a24d', boxShadow: '0 0 18px rgba(201,162,77,0.45)' }} />
          <div style={{ position: 'relative', zIndex: 2 }}>
            <Heart size={36} fill="#e8c37a" color="#f0d799" style={{ filter: 'drop-shadow(0 0 9px rgba(232,195,122,0.9))' }} />
          </div>
          <div style={{ width: 92, height: 92, borderRadius: '50%', marginLeft: -14, background: profile.photoUrl ? `center/cover no-repeat url(${profile.photoUrl})` : 'linear-gradient(160deg,#1a1a1a,#2a2a2a)', border: '2px solid #c9a24d', boxShadow: '0 0 18px rgba(201,162,77,0.45)' }} />
        </div>

        <div style={{ fontFamily: "'Cormorant Garamond', serif", color: '#ffffff', fontSize: 36.5, fontWeight: 600, marginBottom: 6 }}>It's a Match</div>
        <div style={{ color: '#ffffff', fontSize: 16.5, marginBottom: 4, fontFamily: "'Cormorant Garamond', serif" }}>You and {profile.name} liked each other</div>
        <div style={{ color: '#bdbdbd', fontSize: 12.5, marginBottom: pending ? 12 : 26 }}>{profile._score}/5 core placements aligned</div>
        {pending && (
          <div style={{ color: '#f0d799', fontSize: 12, maxWidth: 260, margin: '0 auto 22px', lineHeight: 1.5 }}>
            You already have {MATCH_CAP} open conversations, so {profile.name} is waiting in your Pending folder. Close a conversation to open this one.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, width: 240, margin: '0 auto' }}>
          <button className="rl-actionbtn" onClick={() => onMessage(profile)} style={{ background: 'linear-gradient(135deg, #f7e7bc, #c9973f)', border: '1px solid rgba(247,231,188,0.7)', color: '#000000', fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: 13, letterSpacing: 1.5, padding: '14px 0', borderRadius: 28, cursor: 'pointer', boxShadow: '0 10px 28px rgba(201,151,63,0.5), inset 0 1px 0 rgba(255,255,255,0.4)' }}>{pending ? 'VIEW MY MATCHES' : 'SEND A MESSAGE'}</button>
          <button className="rl-actionbtn" onClick={onKeepBrowsing} style={{ background: 'rgba(12,12,12,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.35)', color: '#ffffff', fontFamily: 'Cinzel, serif', fontSize: 12, letterSpacing: 1.5, padding: '12px 0', borderRadius: 28, cursor: 'pointer' }}>KEEP BROWSING</button>
        </div>
      </div>
    </div>
  );
}

// Messages list — an always-reachable home for every match/conversation.
function MessagesModal({ matches, pendingIds, onOpenChat, onBack }) {
  const open = matches.filter(m => !pendingIds.has(m.matchId));
  const waiting = matches.filter(m => pendingIds.has(m.matchId));
  const row = (m, locked) => (
    <button key={m.matchId} className="rl-row" onClick={() => !locked && onOpenChat(m)} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'linear-gradient(135deg, rgba(20,20,20,0.95), rgba(8,8,8,0.95))', border: '1px solid rgba(201,162,77,0.32)', borderRadius: 16, padding: '13px 15px', cursor: locked ? 'default' : 'pointer', textAlign: 'left', width: '100%', opacity: locked ? 0.62 : 1, boxShadow: '0 8px 22px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(247,231,188,0.08)' }}>
      <div style={{ width: 54, height: 54, borderRadius: '50%', flexShrink: 0, background: m.photoUrl ? `center/cover no-repeat url(${m.photoUrl})` : 'linear-gradient(160deg,#1a1a1a,#2a2a2a)', border: '1.5px solid rgba(240,215,153,0.6)', boxShadow: '0 0 12px rgba(201,162,77,0.3)', filter: locked ? 'blur(2px)' : 'none' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", color: '#ffffff', fontSize: 19.4 }}>{m.name}</div>
        <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 9.5, letterSpacing: 1, marginTop: 2 }}>{m._score}/5 · {matchLabel(m._score).toUpperCase()}</div>
      </div>
      {locked ? <Lock size={16} color="#c9a24d" /> : <span style={{ color: '#c9a24d', fontSize: 20 }}>›</span>}
    </button>
  );
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000', zIndex: 60, overflowY: 'auto' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 260, background: 'radial-gradient(120% 100% at 50% 0%, rgba(201,151,63,0.16), rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', maxWidth: 400, margin: '0 auto', minHeight: '100vh', padding: '22px 18px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#c9a24d', fontSize: 18, cursor: 'pointer' }}>←</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Crown size={22} />
            <span style={{ fontFamily: 'Cinzel, serif', color: '#ffffff', fontSize: 15, letterSpacing: 3 }}>MATCHES{open.length > 0 ? ` · ${open.length}` : ''}</span>
          </div>
        </div>

        {matches.length === 0 ? (
          <div style={{ color: '#bdbdbd', fontFamily: "'Cormorant Garamond', serif", fontSize: 16, textAlign: 'center', marginTop: 70, lineHeight: 1.7, fontStyle: 'italic', padding: '0 20px' }}>
            No matches yet.<br />When you and someone both like each other, they'll appear here — tap to start a conversation.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {open.map(m => row(m, false))}
            {waiting.length > 0 && (
              <>
                <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 11, letterSpacing: 2, margin: '18px 0 2px' }}>PENDING · {waiting.length}</div>
                <div style={{ color: '#8f8f8f', fontSize: 11.5, lineHeight: 1.5, marginBottom: 4 }}>
                  You can keep {MATCH_CAP} conversations open at a time. Close one (⋯ in a chat → Close conversation) and the next match here opens up.
                </div>
                {waiting.map(m => row(m, true))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// "Likes You" screen — everyone who liked you and is waiting. Tap a card to see
// their full profile, or the gold heart to like them back and match instantly.
function LikesModal({ likes, loading, onOpenProfile, onLikeBack, onBack }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000', zIndex: 60, overflowY: 'auto' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 260, background: 'radial-gradient(120% 100% at 50% 0%, rgba(201,151,63,0.16), rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', maxWidth: 440, margin: '0 auto', minHeight: '100vh', padding: '22px 16px 96px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#c9a24d', fontSize: 18, cursor: 'pointer' }}>←</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Crown size={22} />
            <span style={{ fontFamily: 'Cinzel, serif', color: '#ffffff', fontSize: 15, letterSpacing: 3 }}>LIKES YOU{likes.length > 0 ? ` · ${likes.length}` : ''}</span>
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#bdbdbd', textAlign: 'center', marginTop: 60, fontFamily: 'Cinzel, serif', fontSize: 12, letterSpacing: 1 }}>✦ LOADING...</div>
        ) : likes.length === 0 ? (
          <div style={{ color: '#bdbdbd', fontFamily: "'Cormorant Garamond', serif", fontSize: 16, textAlign: 'center', marginTop: 70, lineHeight: 1.7, fontStyle: 'italic', padding: '0 20px' }}>
            No likes yet.<br />When someone likes you, they'll appear here — like them back to match instantly.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {likes.map(person => (
              <div key={person.id} style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1.5px solid rgba(240,215,153,0.55)', boxShadow: '0 12px 30px -10px rgba(0,0,0,0.6), 0 0 20px rgba(201,162,77,0.14), inset 0 1px 0 rgba(247,231,188,0.2)' }}>
                <div onClick={() => onOpenProfile(person)} style={{ width: '100%', aspectRatio: '3 / 4', cursor: 'pointer', position: 'relative', background: person.photoUrl ? `center/cover no-repeat url(${person.photoUrl})` : 'linear-gradient(160deg,#1a1a1a,#2a2a2a)' }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #000000 4%, rgba(0,0,0,0) 58%)' }} />
                  {person._star && (
                    <div style={{ position: 'absolute', top: 9, left: 9, display: 'flex', alignItems: 'center', gap: 4, background: 'linear-gradient(135deg, #f7e7bc, #c9973f)', color: '#000000', fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: 8.5, letterSpacing: 0.8, padding: '4px 8px', borderRadius: 12, boxShadow: '0 4px 12px rgba(201,151,63,0.55)' }}>
                      <Sparkles size={11} /> SHOOTING STAR
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: 12, left: 13, right: 50, fontFamily: "'Cormorant Garamond', serif", color: '#ffffff', fontSize: 20.5, fontWeight: 600, textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}>{person.name}</div>
                </div>
                <button className="rl-actionbtn" onClick={() => onLikeBack(person)} title={`Like ${person.name} back`}
                  style={{ position: 'absolute', bottom: 9, right: 9, width: 42, height: 42, borderRadius: '50%', border: '1px solid rgba(247,231,188,0.8)', background: 'radial-gradient(120% 120% at 50% 0%, #f7e7bc, #c9973f)', color: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(201,151,63,0.5)' }}>
                  <Heart size={18} fill="#000000" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Fixed bottom navigation bar (Hinge-style): Deck, Likes You, Chats, Profile.
function BottomNav({ active, onDeck, onLikes, onMessages, onProfile, likesCount, messagesCount, myPhotoUrl }) {
  const Item = ({ tab, icon, label, onClick, badge }) => {
    const on = active === tab;
    return (
      <button onClick={onClick} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '9px 0 8px', color: on ? '#c9a24d' : '#8f8f8f', position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          {icon}
          {badge > 0 && (
            <span style={{ position: 'absolute', top: -6, right: -12, background: '#c9a24d', color: '#000000', fontSize: 8.5, fontWeight: 700, minWidth: 15, height: 15, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
              {badge > 50 ? '50+' : badge}
            </span>
          )}
        </div>
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 8, letterSpacing: 0.6 }}>{label}</span>
      </button>
    );
  };
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 45, display: 'flex', maxWidth: 440, margin: '0 auto', background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderTop: '1px solid rgba(201,162,77,0.35)', boxShadow: '0 -8px 26px rgba(0,0,0,0.55)' }}>
      <Item tab="deck" icon={<Crown size={20} />} label="DECK" onClick={onDeck} />
      <Item tab="likes" icon={<Heart size={20} fill={active === 'likes' ? '#c9a24d' : 'none'} />} label="LIKES" onClick={onLikes} badge={likesCount} />
      <Item tab="messages" icon={<MessageCircle size={20} />} label="MATCHES" onClick={onMessages} badge={messagesCount} />
      <Item tab="profile" onClick={onProfile} label="PROFILE" icon={
        myPhotoUrl
          ? <div style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${active === 'profile' ? '#c9a24d' : '#8f8f8f'}`, background: `center/cover no-repeat url(${myPhotoUrl})` }} />
          : <div style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${active === 'profile' ? '#c9a24d' : '#8f8f8f'}` }} />
      } />
    </div>
  );
}

// Conversation starters built from their chart + profile, shown in an empty chat.
// Tapping one drops it into the message box so it can be edited before sending.
const MOON_NEEDS = {
  Aries: 'a little adventure', Taurus: 'good food and slow mornings', Gemini: 'great conversation',
  Cancer: 'feeling at home', Leo: 'being celebrated', Virgo: 'things done right',
  Libra: 'harmony and beauty', Scorpio: 'deep honesty', Sagittarius: 'freedom to roam',
  Capricorn: 'security you can build on', Aquarius: 'room to be yourself', Pisces: 'a little magic',
};
function buildIceBreakers(me, them) {
  const out = [];
  const prompts = (them?.profile_extra?.prompts || []).filter(p => p && p.question && (p.answer || '').trim());
  if (prompts.length) out.push(`I loved your answer to "${prompts[0].question}" — tell me more?`);
  if (them?.moon) out.push(`Your Moon is in ${them.moon}, so I'm guessing ${MOON_NEEDS[them.moon] || 'comfort'} matters to you. True?`);
  if (me?.venus && them?.venus) {
    out.push(me.venus === them.venus
      ? `We're both Venus in ${them.venus}. What does your ideal first date look like?`
      : `My Venus is in ${me.venus}, yours is in ${them.venus}. What does your ideal first date look like?`);
  }
  if (them?.sun) out.push(`What's the most ${them.sun} thing about you?`);
  out.push('What are you building in your life right now?');
  return out.slice(0, 3);
}

// ---- Chat timestamps ----
function chatTime(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function chatDayLabel(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return '';
  const today = new Date();
  const startOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function ChatScreen({ profile, myId, token, myProfile, onBack, onClose, onBlock, onReport }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [partner, setPartner] = useState(profile._profile || null);
  const pollRef = useRef(null);

  // Full profile of the person you're chatting with (for ice breakers).
  useEffect(() => {
    if (partner || !profile.id) return;
    fetchFullProfile(profile.id, token).then(p => p && setPartner(p)).catch(() => {});
  }, [profile.id, token, partner]);

  useEffect(() => {
    const load = () => fetchMessages(profile.matchId, token).then(setMessages).catch(() => {});
    load();
    pollRef.current = setInterval(load, 3000); // simple polling stand-in for realtime
    return () => clearInterval(pollRef.current);
  }, [profile.matchId, token]);

  const send = async () => {
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft('');
    await postMessage(profile.matchId, myId, text, token);
    setMessages(m => [...(Array.isArray(m) ? m : []), { sender_id: myId, text, created_at: new Date().toISOString() }]);
  };

  // Always render from an array, even if a bad fetch ever slips a non-array into state.
  const msgList = Array.isArray(messages) ? messages : [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000', zIndex: 50, display: 'flex', flexDirection: 'column', maxWidth: 400, margin: '0 auto' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '18px 16px', borderBottom: '1px solid rgba(201,162,77,0.25)' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#c9a24d', fontSize: 18, cursor: 'pointer' }}>←</button>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: profile.photoUrl ? `center/cover no-repeat url(${profile.photoUrl})` : '#1a1a1a', border: '1px solid #c9a24d' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", color: '#ffffff', fontSize: 18.2 }}>{profile.name}</div>
          <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 9.5, letterSpacing: 1 }}>{profile._score}/5 · {matchLabel(profile._score).toUpperCase()}</div>
        </div>
        <button onClick={() => setMenuOpen(o => !o)} title="More" style={{ background: 'none', border: '1px solid rgba(201,162,77,0.35)', borderRadius: '50%', width: 32, height: 32, color: '#c9a24d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MoreHorizontal size={16} /></button>
        {menuOpen && (
          <div style={{ position: 'absolute', top: 60, right: 14, zIndex: 5, background: '#111111', border: '1px solid rgba(201,162,77,0.4)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.7)', minWidth: 200 }}>
            {[
              ['Close conversation', () => onClose(profile)],
              ['Report', () => onReport(profile)],
              ['Block', () => onBlock(profile)],
            ].map(([label, fn]) => (
              <button key={label} onClick={() => { setMenuOpen(false); fn(); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid rgba(201,162,77,0.15)', color: label === 'Block' ? '#ffffff' : '#ffffff', padding: '13px 16px', fontSize: 13.5, cursor: 'pointer' }}>{label}</button>
            ))}
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {msgList.length === 0 && (
          <div style={{ color: '#bdbdbd', fontSize: 14.2, textAlign: 'center', marginTop: 30, fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic' }}>
            You matched with {profile.name}. Say hello.
          </div>
        )}
        {msgList.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
            <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 10, letterSpacing: 2, textAlign: 'center' }}>✦ ICE BREAKERS ✦</div>
            {buildIceBreakers(myProfile, partner).map(q => (
              <button key={q} className="rl-row" onClick={() => setDraft(q)} style={{ textAlign: 'left', background: 'linear-gradient(135deg, rgba(20,20,20,0.95), rgba(8,8,8,0.95))', border: '1px solid rgba(201,162,77,0.32)', borderRadius: 14, padding: '11px 14px', color: '#f0d799', fontFamily: "'Cormorant Garamond', serif", fontSize: 15.4, lineHeight: 1.45, cursor: 'pointer' }}>{q}</button>
            ))}
          </div>
        )}
        {msgList.map((m, i) => {
          const mine = m.sender_id === myId;
          const day = chatDayLabel(m.created_at);
          const prevDay = i > 0 ? chatDayLabel(msgList[i - 1].created_at) : null;
          return (
            <React.Fragment key={m.id || i}>
              {day && day !== prevDay && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 4px' }}>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(201,162,77,0.35))' }} />
                  <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 9.5, letterSpacing: 2 }}>{day.toUpperCase()}</div>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(201,162,77,0.35), transparent)' }} />
                </div>
              )}
              <div style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '75%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  background: mine ? 'linear-gradient(135deg, #f0d799, #c9973f)' : '#141414',
                  color: mine ? '#000000' : '#ffffff',
                  border: mine ? 'none' : '1px solid rgba(201,162,77,0.25)',
                  borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: '9px 14px', fontSize: 13.5, lineHeight: 1.35,
                  boxShadow: mine ? '0 4px 14px rgba(201,151,63,0.35)' : '0 4px 14px rgba(0,0,0,0.35)',
                }}>{m.text}</div>
                {m.created_at && (
                  <div style={{ fontSize: 10.5, color: 'rgba(201,162,77,0.7)', marginTop: 3, padding: '0 4px', letterSpacing: 0.3 }}>{chatTime(m.created_at)}</div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 14, borderTop: '1px solid rgba(201,162,77,0.25)' }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Write something..." style={{ flex: 1, background: '#111111', border: '1px solid rgba(201,162,77,0.3)', borderRadius: 20, padding: '10px 16px', color: '#ffffff', fontSize: 13.5, outline: 'none' }} />
        <button onClick={send} style={{ background: 'radial-gradient(120% 120% at 50% 0%, #f7e7bc, #c9973f)', border: 'none', borderRadius: '50%', width: 42, height: 42, color: '#000000', cursor: 'pointer', fontSize: 15, boxShadow: '0 4px 14px rgba(201,151,63,0.5)' }}>➤</button>
      </div>
    </div>
  );
}

const REPORT_REASONS = ['Fake profile or catfish', 'Inappropriate messages or photos', 'Harassment or threats', 'Scam or asking for money', 'Underage', 'Something else'];

function ReportModal({ person, onSubmit, onCancel }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try { await onSubmit(person, reason, details, alsoBlock); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380, background: 'linear-gradient(158deg, #141414, #050505)', border: '1px solid rgba(201,162,77,0.4)', borderRadius: 20, padding: '22px 20px', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ fontFamily: 'Cinzel, serif', color: '#ffffff', fontSize: 15, letterSpacing: 2, marginBottom: 4 }}>REPORT {String(person.name || '').toUpperCase()}</div>
        <div style={{ color: '#8f8f8f', fontSize: 12, marginBottom: 14 }}>Reports are private. {person.name} won't know it was you.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {REPORT_REASONS.map(r => (
            <button key={r} onClick={() => setReason(r)} style={{ textAlign: 'left', padding: '10px 13px', borderRadius: 12, cursor: 'pointer', fontSize: 13, border: `1px solid ${reason === r ? 'rgba(247,231,188,0.8)' : 'rgba(201,162,77,0.3)'}`, background: reason === r ? 'rgba(201,162,77,0.18)' : 'transparent', color: '#ffffff' }}>{r}</button>
          ))}
        </div>
        <textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={500} placeholder="Anything else we should know? (optional)" style={{ ...inputStyle, marginTop: 12, minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#bdbdbd', fontSize: 12.5, marginTop: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={alsoBlock} onChange={e => setAlsoBlock(e.target.checked)} style={{ accentColor: '#c9a24d' }} /> Also block {person.name}
        </label>
        {err && <div style={{ color: '#ffffff', fontSize: 12, marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '12px 0', borderRadius: 24, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#ffffff', fontFamily: 'Cinzel, serif', fontSize: 12, letterSpacing: 1, cursor: 'pointer' }}>CANCEL</button>
          <button onClick={submit} disabled={!reason || busy} style={{ flex: 1, padding: '12px 0', borderRadius: 24, border: '1px solid rgba(247,231,188,0.7)', background: 'linear-gradient(135deg, #f7e7bc, #c9973f)', color: '#000000', fontWeight: 700, fontFamily: 'Cinzel, serif', fontSize: 12, letterSpacing: 1, cursor: reason ? 'pointer' : 'default', opacity: reason ? 1 : 0.5 }}>{busy ? 'SENDING...' : 'SEND REPORT'}</button>
        </div>
      </div>
    </div>
  );
}

function Toast({ text }) {
  if (!text) return null;
  return (
    <div style={{ position: 'fixed', bottom: 86, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: 'rgba(21,15,19,0.95)', border: '1px solid rgba(201,162,77,0.5)', color: '#f0d799', padding: '11px 18px', borderRadius: 22, fontSize: 13, boxShadow: '0 10px 30px rgba(0,0,0,0.6)', maxWidth: '86vw', textAlign: 'center' }}>{text}</div>
  );
}

export default function RealLoveSwipeApp({ onGoToSignup }) {
  const [session, setSession] = useState(null); // { userId, accessToken }
  const [myProfile, setMyProfile] = useState(null);
  const [deck, setDeck] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadError, setLoadError] = useState('');
  const [maxDistance] = useState(100); // fallback when the profile has no saved max_distance
  const [ageRange] = useState([35, 65]); // fallback when the profile has no saved age range
  const [matchedProfile, setMatchedProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showLikes, setShowLikes] = useState(false);
  const [incomingLikes, setIncomingLikes] = useState([]); // people who liked you (pending)
  const [likesLoading, setLikesLoading] = useState(false);
  const [myPhotoUrl, setMyPhotoUrl] = useState(null); // your own photo, for the match celebration
  const [fling, setFling] = useState(null); // 'left' (pass) | 'right' (like) — animates the top card off when a button is tapped
  const [starsUsed, setStarsUsed] = useState(0); // shooting stars sent this month
  const [reportTarget, setReportTarget] = useState(null); // person being reported
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const showToast = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  };

  const loadDeck = async (dist, ages) => {
    console.log('[DEBUG] loadDeck called. session:', session, 'myProfile:', myProfile);
    if (!session || !myProfile) {
      console.log('[DEBUG] loadDeck bailed early — session or myProfile missing.');
      return;
    }
    setLoadStatus('loading'); setLoadError('');
    try {
      const candidates = await fetchCandidates(session.userId, session.accessToken, {
        maxMiles: dist, minAge: ages[0], maxAge: ages[1],
      });
      console.log('[DEBUG] candidates.length:', candidates.length, 'candidates:', candidates);
      const ids = candidates.map(c => c.id);
      // Full rows give us gender/seeking (who sees whom), height, and exact chart
      // degrees — none of which the nearby_profiles RPC returns.
      const [photoMap, fullMap, blocked] = await Promise.all([
        fetchPhotos(ids, session.accessToken),
        fetchProfilesByIds(ids, session.accessToken),
        fetchBlockedIds(session.userId, session.accessToken),
      ]);
      const scored = candidates
        .map(c => ({ ...(fullMap[c.id] || {}), ...c, chart_degrees: fullMap[c.id]?.chart_degrees }))
        .filter(c => !blocked.has(c.id) && genderFits(myProfile, c))
        .map(c => {
          const { score, breakdown } = computeMatch(myProfile, c);
          return { ...c, photoUrl: photoMap[c.id], _score: score, _breakdown: breakdown };
        }).sort((a, b) => b._score - a._score);
      setDeck(scored);
      setHistory([]);
      setLoadStatus('success');
    } catch (e) {
      setLoadStatus('error'); setLoadError(e.message);
    }
  };

  const handleLogin = async (sess) => {
    setSession(sess);
    try {
      const profile = await fetchMyProfile(sess.userId, sess.accessToken);
      setMyProfile(profile);
      // Grab your own photo up front so the match celebration can show both faces.
      fetchPhotos([sess.userId], sess.accessToken).then(pm => setMyPhotoUrl(pm[sess.userId])).catch(() => {});
      // Load your pending "Likes You" in the background for the bottom-nav count.
      fetchIncomingLikes(sess.userId, sess.accessToken).then(setIncomingLikes).catch(() => {});
      fetchStarsUsed(sess.userId, sess.accessToken).then(setStarsUsed).catch(() => {});
      const blocked = await fetchBlockedIds(sess.userId, sess.accessToken);
      const existing = (await fetchMyMatches(sess.userId, sess.accessToken))
        .filter(m => !blocked.has(m.user_a === sess.userId ? m.user_b : m.user_a));
      const partnerIds = existing.map(m => (m.user_a === sess.userId ? m.user_b : m.user_a));
      const [profileMap, photoMap] = await Promise.all([
        fetchProfilesByIds(partnerIds, sess.accessToken),
        fetchPhotos(partnerIds, sess.accessToken),
      ]);
      setMatches(existing.map(m => {
        const partnerId = m.user_a === sess.userId ? m.user_b : m.user_a;
        const partnerProfile = profileMap[partnerId];
        const { score } = partnerProfile ? computeMatch(profile, partnerProfile) : { score: 0 };
        return {
          matchId: m.id,
          createdAt: m.created_at,
          id: partnerId,
          name: partnerProfile?.name || 'Match',
          city: partnerProfile?.city,
          photoUrl: photoMap[partnerId],
          _profile: partnerProfile,
          _score: score,
        };
      }));
    } catch (e) {
      setLoadStatus('error'); setLoadError(e.message);
    }
  };

  // Clears every piece of user state so the next person to sign in on this
  // device never sees the previous user's deck, matches, or chats.
  const handleLogout = async () => {
    if (session) await signOutRequest(session.accessToken);
    setSession(null);
    setMyProfile(null);
    setDeck([]);
    setHistory([]);
    setMatches([]);
    setActiveChat(null);
    setMatchedProfile(null);
    setViewingProfile(null);
    setShowMessages(false);
    setShowLikes(false);
    setIncomingLikes([]);
    setMyPhotoUrl(null);
    setStarsUsed(0);
    setReportTarget(null);
    setShowSettings(false);
    setLoadStatus('idle');
    setLoadError('');
  };

  useEffect(() => {
    if (session && myProfile) loadDeck(myProfile.max_distance ?? maxDistance, [myProfile.min_age ?? ageRange[0], myProfile.max_age ?? ageRange[1]]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, myProfile]);

  // Button-driven swipe: fling the top card off in the right direction, THEN
  // run the actual swipe once the animation finishes. Guards against double-taps.
  const flingSwipe = (dir, star = false) => {
    if (!deck.length || fling) return;
    setFling(dir);
    setTimeout(() => { setFling(null); swipe(dir, star); }, 330);
  };

  const isPremium = !!(myProfile && myProfile.is_premium);
  const starsLeft = isPremium ? Infinity : Math.max(0, STARS_PER_MONTH - starsUsed);

  // Shooting star = a super like: they see you at the top of their Likes with a gold badge.
  const sendShootingStar = () => {
    if (!deck.length || fling) return;
    if (starsLeft <= 0) {
      showToast(`You've used your ${STARS_PER_MONTH} shooting stars this month. They refill on the 1st.`);
      return;
    }
    setStarsUsed(n => n + 1);
    showToast(`✦ Shooting star sent to ${deck[0].name}`);
    flingSwipe('right', true);
  };

  const addMatch = (person, match) => {
    const withMatchId = { ...person, matchId: match.id, createdAt: match.created_at, _profile: person._profile || person };
    setMatches(m => (m.some(x => x.matchId === match.id) ? m : [...m, withMatchId]));
    return withMatchId;
  };

  const swipe = async (dir, star = false) => {
    const [current, ...rest] = deck;
    if (!current) return;
    setHistory(h => [...h, current]);
    setDeck(rest);
    if (dir === 'right') {
      await sendLike(session.userId, current.id, session.accessToken, star);
      const match = await checkForMatch(session.userId, current.id, session.accessToken);
      if (match) setMatchedProfile(addMatch(current, match));
    }
  };

  // Free tier: the oldest MATCH_CAP matches are open, the rest wait in Pending.
  const pendingIds = new Set(
    isPremium ? [] : [...matches]
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
      .slice(MATCH_CAP)
      .map(m => m.matchId)
  );

  // ---- Safety actions ----
  const removePerson = (personId) => {
    setMatches(ms => ms.filter(m => m.id !== personId));
    setDeck(d => d.filter(p => p.id !== personId));
    setHistory(h => h.filter(p => p.id !== personId));
    setIncomingLikes(l => l.filter(p => p.id !== personId));
    if (activeChat && activeChat.id === personId) setActiveChat(null);
    if (viewingProfile && viewingProfile.id === personId) setViewingProfile(null);
  };

  const closeConversation = async (m) => {
    if (!window.confirm(`Close your conversation with ${m.name}? You won't see each other again.`)) return;
    try {
      await unmatch(m.matchId, session.accessToken);
      removePerson(m.id);
      showToast(`Conversation with ${m.name} closed.`);
    } catch (e) { showToast(e.message); }
  };

  const doBlock = async (person) => {
    if (!window.confirm(`Block ${person.name}? They won't be able to see you or message you.`)) return;
    try {
      await blockUser(session.userId, person.id, session.accessToken);
      const m = matches.find(x => x.id === person.id);
      if (m) await unmatch(m.matchId, session.accessToken).catch(() => {});
      removePerson(person.id);
      showToast(`${person.name} is blocked.`);
    } catch (e) { showToast(e.message); }
  };

  const doReport = async (person, reason, details, alsoBlock) => {
    await reportUser(session.userId, person.id, reason, details, session.accessToken);
    if (alsoBlock) {
      await blockUser(session.userId, person.id, session.accessToken).catch(() => {});
      const m = matches.find(x => x.id === person.id);
      if (m) await unmatch(m.matchId, session.accessToken).catch(() => {});
      removePerson(person.id);
    }
    setReportTarget(null);
    showToast('Thank you. Our team will review this report.');
  };

  // Coming back from Settings: reload your profile so new filters / "show me" apply.
  const closeSettings = async () => {
    setShowSettings(false);
    try { setMyProfile(await fetchMyProfile(session.userId, session.accessToken)); } catch (e) { /* keep current */ }
  };
const viewMyProfile = async () => {
    // Pull a FRESH copy of your profile + ALL your photos so the Hinge-style view
    // shows everything and reflects edits you just saved in Settings.
    let me = myProfile;
    try {
      me = await fetchMyProfile(session.userId, session.accessToken);
      setMyProfile(me);
    } catch (e) {
      // fall back to the profile already in memory if the refetch fails
    }
    const allPhotos = await fetchAllPhotos(session.userId, session.accessToken);
    const myChart = PLANETS.map(p => ({
      planet: p, category: CATEGORY[p], matchSign: me[p.toLowerCase()], hit: true,
    }));
    setViewingProfile({
      ...me,
      age: calcAge(me.birth_date),
      _photos: allPhotos,
      photoUrl: allPhotos[0],
      _isMe: true,
      _breakdown: myChart,
    });
  };

  // Open another person's full profile from the deck's ⓘ button: pull all their
  // photos + their prompts/details, keeping the compatibility score already computed.
  const openOtherProfile = async (deckProfile) => {
    setViewingProfile({ ...deckProfile }); // show immediately with the one photo
    try {
      const [allPhotos, full] = await Promise.all([
        fetchAllPhotos(deckProfile.id, session.accessToken),
        fetchFullProfile(deckProfile.id, session.accessToken),
      ]);
      setViewingProfile({
        ...deckProfile,
        ...(full || {}),
        // keep the deck's computed score/breakdown/photo, don't let the raw row clobber them
        _score: deckProfile._score,
        _breakdown: deckProfile._breakdown,
        age: deckProfile.age,
        distance_miles: deckProfile.distance_miles,
        _photos: allPhotos.length ? allPhotos : (deckProfile.photoUrl ? [deckProfile.photoUrl] : []),
        photoUrl: allPhotos[0] || deckProfile.photoUrl,
      });
    } catch (e) {
      // the immediate single-photo view already showed; leave it as-is on error
    }
  };
  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setDeck(d => [prev, ...d]);
  };

  // Open the "Likes You" screen and refresh the list.
  const openLikes = async () => {
    setShowLikes(true);
    setLikesLoading(true);
    try { setIncomingLikes(await fetchIncomingLikes(session.userId, session.accessToken)); }
    catch (e) { /* keep whatever we had */ }
    setLikesLoading(false);
  };

  // Like someone back from the Likes screen — they already liked you, so this
  // completes the mutual match and fires the celebration.
  const likeBack = async (person) => {
    setIncomingLikes(list => list.filter(x => x.id !== person.id));
    await sendLike(session.userId, person.id, session.accessToken);
    const match = await checkForMatch(session.userId, person.id, session.accessToken);
    if (match) {
      const { score } = myProfile && person._profile ? computeMatch(myProfile, person._profile) : { score: 0 };
      setShowLikes(false);
      setMatchedProfile(addMatch({ ...person, _score: score }, match));
    }
  };

  // View a full profile from the Likes screen (computes the compatibility first).
  const openLikeProfile = (person) => {
    const { score, breakdown } = myProfile && person._profile
      ? computeMatch(myProfile, person._profile) : { score: 0, breakdown: [] };
    openOtherProfile({
      ...person._profile, id: person.id, photoUrl: person.photoUrl,
      _score: score, _breakdown: breakdown, age: calcAge(person._profile?.birth_date),
    });
  };

  const goToDeck = () => { setShowLikes(false); setShowMessages(false); setViewingProfile(null); setActiveChat(null); };
  const navActive = showLikes ? 'likes' : showMessages ? 'messages' : (viewingProfile && viewingProfile._isMe) ? 'profile' : 'deck';

  if (!session) return <LoginScreen onLogin={handleLogin} onGoToSignup={onGoToSignup} />;

  if (loadStatus === 'loading' || !myProfile) {
    return (
      <div style={{ minHeight: '100vh', background: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bdbdbd', fontFamily: 'Cinzel, serif', fontSize: 13, letterSpacing: 1 }}>
        ✦ LOADING YOUR MATCHES...
      </div>
    );
  }

  if (loadStatus === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: '#000000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: 13, padding: 24, textAlign: 'center', gap: 12 }}>
        <div>{loadError}</div>
        <div style={{ color: '#7a7a7a', fontSize: 11.5 }}>
          Common cause: your profile is missing a latitude/longitude (use "Use my location" during signup) or has no photos yet.
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', width: '100%', boxSizing: 'border-box', overflowX: 'hidden', background: '#000000', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 16px 96px', fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Montserrat:wght@400;500;600&family=Dancing+Script:wght@600&display=swap');
        * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        @keyframes wheelspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes starTwinkle { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.9; } }
        @keyframes celestialDrift { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-14px) rotate(8deg); } }
        @keyframes rlLikePulse { 0%, 100% { box-shadow: 0 8px 24px rgba(201,151,63,0.55), inset 0 1px 0 rgba(255,255,255,0.4); } 50% { box-shadow: 0 10px 34px rgba(232,195,122,0.85), inset 0 1px 0 rgba(255,255,255,0.5); } }
        .rl-actionbtn { transition: transform 0.14s cubic-bezier(.2,.8,.2,1), filter 0.14s ease; }
        .rl-actionbtn:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.08); }
        .rl-actionbtn:active:not(:disabled) { transform: scale(0.92); }
        .rl-likebtn:not(:disabled) { animation: rlLikePulse 2.6s ease-in-out infinite; }
        .rl-wide-only { display: none; }
        @media (min-width: 820px) { .rl-wide-only { display: block; } }
        .rl-row { transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease; }
        .rl-row:hover { transform: translateY(-2px); border-color: rgba(240,215,153,0.6); box-shadow: 0 14px 30px -8px rgba(0,0,0,0.7), 0 0 18px rgba(201,162,77,0.2); }
      `}</style>

      <CelestialBackdrop />

      <button
        onClick={handleLogout}
        title="Log out"
        style={{
          position: 'absolute', top: 18, right: 18, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: '1px solid rgba(201,162,77,0.4)',
          borderRadius: 20, padding: '6px 13px', color: '#c9a24d',
          fontFamily: 'Cinzel, serif', fontSize: 10, letterSpacing: 1, cursor: 'pointer',
        }}
      >
        <LogOut size={13} /> LOG OUT
      </button>
    <button
        onClick={() => setShowSettings(true)}
        title="Settings"
        style={{
          position: 'absolute', top: 18, left: 18, zIndex: 10,
          background: 'transparent', border: '1px solid rgba(201,162,77,0.4)',
          borderRadius: 20, padding: '6px 13px', color: '#c9a24d',
          fontFamily: 'Cinzel, serif', fontSize: 10, letterSpacing: 1, cursor: 'pointer',
        }}
      >
        SETTINGS
      </button>  

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 12 }}>
        <Crown size={26} />
        <span style={{ fontFamily: 'Cinzel, serif', color: '#ffffff', fontSize: 17, letterSpacing: 3 }}>REAL LOVE</span>
      </div>

      <div style={{ height: 14 }} />

      <div style={{ position: 'relative', zIndex: 1, width: 320, height: 480 }}>
        {deck.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, border: '1.5px solid rgba(240,215,153,0.4)', borderRadius: 22, background: 'linear-gradient(158deg, #121212, #060606)', boxShadow: 'inset 0 1px 0 rgba(247,231,188,0.12), 0 24px 60px -20px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <ZodiacWheel size={72} opacity={0.6} spin />
            <div style={{ fontFamily: 'Cinzel, serif', color: '#ffffff', fontSize: 15, letterSpacing: 1.5 }}>NO MORE PROFILES</div>
            {history.length > 0 && <button className="rl-actionbtn" onClick={undo} style={{ background: 'radial-gradient(120% 120% at 50% 0%, #1c1c1c, #0a0a0a)', border: '1px solid rgba(240,215,153,0.5)', color: '#f0d799', padding: '9px 20px', borderRadius: 24, cursor: 'pointer', fontSize: 12, fontFamily: 'Cinzel, serif', letterSpacing: 1, boxShadow: '0 6px 16px rgba(0,0,0,0.45)' }}>GO BACK</button>}
          </div>
        )}
        {deck.slice(0, 3).reverse().map((profile, i, arr) => {
          const top = i === arr.length - 1;
          return (
            <SwipeCard key={profile.id} profile={profile} isTop={top} zIndex={i} onSwipe={swipe} onViewProfile={openOtherProfile} fling={top ? fling : null} />
          );
        })}
      </div>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 20, marginTop: 28, alignItems: 'center' }}>
        <button className="rl-actionbtn" onClick={() => flingSwipe('left')} disabled={!deck.length} title="Pass" style={{ width: 56, height: 56, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.55)', background: 'radial-gradient(120% 120% at 50% 0%, #1c1c1c, #0a0a0a)', color: '#e6e6e6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 8px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)' }}><X size={23} /></button>
        <button className="rl-actionbtn" onClick={undo} disabled={!history.length} title="Undo" style={{ width: 42, height: 42, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.22)', background: 'radial-gradient(120% 120% at 50% 0%, #181818, #0b0b0b)', color: '#bdbdbd', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: history.length ? 1 : 0.3, boxShadow: '0 6px 16px rgba(0,0,0,0.45)' }}><RotateCcw size={16} /></button>
        <button className="rl-actionbtn" onClick={sendShootingStar} disabled={!deck.length} title={isPremium ? 'Shooting star' : `Shooting star — ${starsLeft} left this month`} style={{ position: 'relative', width: 46, height: 46, borderRadius: '50%', border: '1px solid rgba(201,162,77,0.6)', background: 'radial-gradient(120% 120% at 50% 0%, #1c1c1c, #0a0a0a)', color: '#f0d799', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(0,0,0,0.45)', opacity: starsLeft > 0 ? 1 : 0.45 }}>
          <Sparkles size={20} />
          {!isPremium && (
            <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9, background: 'linear-gradient(135deg, #f7e7bc, #c9973f)', color: '#000000', fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>{starsLeft}</span>
          )}
        </button>
        <button className="rl-actionbtn rl-likebtn" onClick={() => flingSwipe('right')} disabled={!deck.length} title="Like" style={{ width: 56, height: 56, borderRadius: '50%', border: '1px solid rgba(247,231,188,0.85)', background: 'radial-gradient(120% 120% at 50% 0%, #f7e7bc, #c9973f)', color: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 8px 24px rgba(201,151,63,0.55), inset 0 1px 0 rgba(255,255,255,0.4)' }}><Heart size={22} fill="#000000" /></button>
      </div>

      {matchedProfile && <MatchModal profile={matchedProfile} myPhotoUrl={myPhotoUrl} pending={pendingIds.has(matchedProfile.matchId)}
        onMessage={(p) => { setMatchedProfile(null); if (pendingIds.has(p.matchId)) setShowMessages(true); else setActiveChat(p); }}
        onKeepBrowsing={() => setMatchedProfile(null)} />}
      {showLikes && <LikesModal likes={incomingLikes} loading={likesLoading} onOpenProfile={openLikeProfile} onLikeBack={likeBack} onBack={() => setShowLikes(false)} />}
      {showMessages && <MessagesModal matches={matches} pendingIds={pendingIds} onOpenChat={(m) => { setShowMessages(false); setActiveChat(m); }} onBack={() => setShowMessages(false)} />}
      {activeChat && <ChatScreen profile={activeChat} myId={session.userId} token={session.accessToken} myProfile={myProfile} onBack={() => setActiveChat(null)}
        onClose={closeConversation} onBlock={doBlock} onReport={setReportTarget} />}
      {viewingProfile && <ProfileModal profile={viewingProfile} onClose={() => setViewingProfile(null)} onBlock={doBlock} onReport={setReportTarget} />}
      {reportTarget && <ReportModal person={reportTarget} onSubmit={doReport} onCancel={() => setReportTarget(null)} />}
      <Toast text={toast} />
        {showSettings && (
        <SettingsScreen
          userId={session.userId}
          accessToken={session.accessToken}
          onBack={closeSettings}
          onLoggedOut={() => { setShowSettings(false); handleLogout(); }}
        />
      )}

      <BottomNav
        active={navActive}
        onDeck={goToDeck}
        onLikes={openLikes}
        onMessages={() => { setShowLikes(false); setShowMessages(true); }}
        onProfile={() => { setShowLikes(false); setShowMessages(false); viewMyProfile(); }}
        likesCount={incomingLikes.length}
        messagesCount={matches.length - pendingIds.size}
        myPhotoUrl={myPhotoUrl}
      />
    </div>
  );
}

const safetyLinkStyle = {
  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
  color: '#8f8f8f', fontFamily: 'Cinzel, serif', fontSize: 10.5, letterSpacing: 1.5, cursor: 'pointer',
};

const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(8,8,8,0.9)', border: '1px solid rgba(201,162,77,0.35)',
  borderRadius: 12, padding: '13px 16px', color: '#ffffff', fontSize: 14, outline: 'none',
  boxShadow: 'inset 0 1px 0 rgba(247,231,188,0.06)',
};
