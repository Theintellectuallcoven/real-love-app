import React, { useState, useEffect, useRef } from 'react';
import { Heart, X, Star, RotateCcw, LogIn } from 'lucide-react';

const PLANETS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars'];
const GLYPH = { Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂' };
const CATEGORY = {
  Sun: 'Core Connection', Moon: 'Emotional Bond', Mercury: 'Mental Stimulation',
  Venus: 'Romantic Chemistry', Mars: 'Physical Chemistry',
};
const ELEMENT = {
  Aries: 'Fire', Leo: 'Fire', Sagittarius: 'Fire',
  Taurus: 'Earth', Virgo: 'Earth', Capricorn: 'Earth',
  Gemini: 'Air', Libra: 'Air', Aquarius: 'Air',
  Cancer: 'Water', Scorpio: 'Water', Pisces: 'Water',
};
const COMPAT = {
  Fire: { Fire: 1, Air: 1, Earth: 0, Water: 0 },
  Air: { Fire: 1, Air: 1, Earth: 0, Water: 0 },
  Earth: { Earth: 1, Water: 1, Fire: 0, Air: 0 },
  Water: { Earth: 1, Water: 1, Fire: 0, Air: 0 },
};
function scorePlacement(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return COMPAT[ELEMENT[a]][ELEMENT[b]];
}
function matchLabel(score) {
  if (score >= 5) return 'Cosmic Match';
  if (score === 4) return 'Strong Match';
  if (score === 3) return 'Promising Match';
  if (score === 2) return 'Mixed Signals';
  return 'Low Alignment';
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

async function fetchMyProfile(userId, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, { headers: headers(token) });
  const rows = await res.json();
  if (!res.ok || !rows.length) throw new Error('Could not load your profile');
  return rows[0];
}

// Uses the nearby_profiles() Postgres function — real distance + age filtering.
async function fetchCandidates(userId, token, { maxMiles, minAge, maxAge }) {
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
  if (!res.ok) throw new Error(data.message || 'Could not load matches');
  return data; // [{ id, name, city, age, distance_miles, sun, moon, mercury, venus, mars }]
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
} async function fetchProfilesByIds(profileIds, token) {
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

async function sendLike(likerId, likedId, token) {
  await fetch(`${SUPABASE_URL}/rest/v1/likes`, {
    method: 'POST',
    headers: { ...headers(token), Prefer: 'return=minimal' },
    body: JSON.stringify({ liker_id: likerId, liked_id: likedId }),
  });
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
    `${SUPABASE_URL}/rest/v1/matches?or=(user_a.eq.${myId},user_b.eq.${myId})&select=*`,
    { headers: headers(token) }
  );
  return res.json();
}

async function fetchMessages(matchId, token) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?match_id=eq.${matchId}&order=created_at.asc&select=*`,
    { headers: headers(token) }
  );
  return res.json();
}

async function postMessage(matchId, senderId, text, token) {
  await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: 'POST',
    headers: { ...headers(token), Prefer: 'return=minimal' },
    body: JSON.stringify({ match_id: matchId, sender_id: senderId, text }),
  });
}

function computeMatch(myChart, theirChart) {
  const breakdown = PLANETS.map(p => ({
    planet: p, category: CATEGORY[p],
    userSign: myChart[p.toLowerCase()], matchSign: theirChart[p.toLowerCase()],
    hit: scorePlacement(myChart[p.toLowerCase()], theirChart[p.toLowerCase()]) === 1,
  }));
  return { score: breakdown.filter(b => b.hit).length, breakdown };
}

// ============================================================
// SIGNATURE VISUALS
// ============================================================
function ZodiacWheel({ size = 240, opacity = 1, spin = false }) {
  const glyphs = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ opacity, animation: spin ? 'wheelspin 120s linear infinite' : 'none' }}>
      <circle cx="100" cy="100" r="94" fill="none" stroke="#c9a24d" strokeWidth="0.6" />
      <circle cx="100" cy="100" r="78" fill="none" stroke="#c9a24d" strokeWidth="0.4" opacity="0.6" />
      <circle cx="100" cy="100" r="60" fill="none" stroke="#c9a24d" strokeWidth="0.4" opacity="0.4" />
      {glyphs.map((g, i) => {
        const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const x = 100 + 86 * Math.cos(angle), y = 100 + 86 * Math.sin(angle);
        return <text key={g} x={x} y={y} fill="#c9a24d" fontSize="9" textAnchor="middle" dominantBaseline="middle" opacity="0.75">{g}</text>;
      })}
    </svg>
  );
}

function Crown({ size = 22 }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 48 34" fill="none">
      <path d="M4 30 L2 10 L14 20 L24 4 L34 20 L46 10 L44 30 Z" fill="url(#crownGrad)" stroke="#f0d799" strokeWidth="0.8" />
      <rect x="3" y="29" width="42" height="4" rx="1" fill="url(#crownGrad)" stroke="#f0d799" strokeWidth="0.8" />
      <circle cx="24" cy="4" r="2.4" fill="#b3384f" />
      <circle cx="14" cy="20" r="1.8" fill="#3f6fb0" />
      <circle cx="34" cy="20" r="1.8" fill="#2f9166" />
      <defs>
        <linearGradient id="crownGrad" x1="0" y1="0" x2="0" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e8c37a" />
          <stop offset="1" stopColor="#a97f2e" />
        </linearGradient>
      </defs>
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
    <div style={{ minHeight: '100vh', background: '#0a0808', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Playfair+Display:ital,wght@0,600;1,500&display=swap');`}</style>
      <Crown size={44} />
      <div style={{ fontFamily: 'Cinzel, serif', color: '#e6e0d4', fontSize: 18, letterSpacing: 3, marginTop: 10 }}>REAL LOVE</div>
      <div style={{ color: '#9d8fa3', fontSize: 12, fontStyle: 'italic', fontFamily: 'Playfair Display, serif', marginBottom: 30 }}>Sign in to see your matches</div>

      <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} style={inputStyle} />
        {status === 'error' && <div style={{ color: '#c9899f', fontSize: 12 }}>{error}</div>}
        <button onClick={submit} disabled={status === 'loading' || !email || !password} style={{
          background: 'linear-gradient(135deg, #e8c37a, #a97f2e)', border: 'none', color: '#0a0808',
          fontFamily: 'Cinzel, serif', fontSize: 13, letterSpacing: 1.5, padding: '13px 0', borderRadius: 4,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <LogIn size={15} /> {status === 'loading' ? 'SIGNING IN...' : 'SIGN IN'}
        </button>
        <div style={{ color: '#6b6070', fontSize: 11, textAlign: 'center', marginTop: 4 }}>
          Use the email + password from your Real Love signup.<button onClick={onGoToSignup} style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', color: '#c9a24d', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Don't have an account? Sign Up</button><button onClick={onGoToSignup} style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', color: '#c9a24d', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Don't have an account? Sign Up</button><button onClick={onGoToSignup} style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', color: '#c9a24d', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Don't have an account? Sign Up</button><button onClick={onGoToSignup} style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', color: '#c9a24d', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Don't have an account? Sign Up</button><button onClick={onGoToSignup} style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', color: '#c9a24d', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Don't have an account? Sign Up</button>
        </div>
      </div>
    </div>
  );
}

function SwipeCard({ profile, onSwipe, isTop, zIndex }) {
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

  const rotate = drag.x / 18;
  const likeOp = Math.min(Math.max(drag.x / 100, 0), 1);
  const passOp = Math.min(Math.max(-drag.x / 100, 0), 1);

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
        transform: `translate(${drag.x}px, ${drag.y}px) rotate(${rotate}deg)`,
        transition: drag.active ? 'none' : 'transform 0.4s cubic-bezier(.2,.8,.2,1)',
        cursor: isTop ? (drag.active ? 'grabbing' : 'grab') : 'default', touchAction: 'none',
      }}
    >
      <div style={{
        width: '100%', height: '100%', borderRadius: 4, overflow: 'hidden', position: 'relative',
        background: profile.photoUrl ? `center/cover no-repeat url(${profile.photoUrl})` : 'linear-gradient(160deg,#2a1e33,#4a2f3d)',
        border: '1px solid rgba(201,162,77,0.3)', boxShadow: '0 24px 70px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
        <div style={{ position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)' }}>
          <ZodiacWheel size={220} opacity={0.14} />
        </div>

        <div style={{ position: 'absolute', top: 22, left: 22, padding: '5px 12px', borderRadius: 2, border: '1px solid #c9a24d', color: '#c9a24d', fontFamily: 'Cinzel, serif', fontSize: 11, letterSpacing: 2, opacity: likeOp }}>ALIGNED</div>
        <div style={{ position: 'absolute', top: 22, right: 22, padding: '5px 12px', borderRadius: 2, border: '1px solid #a3768f', color: '#a3768f', fontFamily: 'Cinzel, serif', fontSize: 11, letterSpacing: 2, opacity: passOp }}>PASS</div>

        <button onClick={() => setExpanded(s => !s)} style={{
          position: 'absolute', top: 20, right: 20, background: 'rgba(10,8,8,0.55)', border: '1px solid rgba(201,162,77,0.5)',
          borderRadius: 20, padding: '6px 14px', color: '#e0bd6f', fontFamily: 'Cinzel, serif', fontSize: 13, cursor: 'pointer',
        }}>{profile._score}/5</button>

        <div style={{ padding: '20px 22px 24px', background: 'linear-gradient(to top, rgba(8,6,8,0.94), rgba(8,6,8,0.05) 70%)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontFamily: 'Playfair Display, serif', color: '#f2ede2', fontSize: 26, fontWeight: 600 }}>{profile.name}{profile.age ? `, ${profile.age}` : ''}</div>
            <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 10.5, letterSpacing: 1.5 }}>{matchLabel(profile._score).toUpperCase()}</div>
          </div>
          <div style={{ color: '#9d8fa3', fontSize: 12.5, marginTop: 2 }}>{profile.city}{profile.distance_miles != null ? ` · ${profile.distance_miles} mi away` : ''}</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 14 }}>
            {profile._breakdown.map(b => (
              <div key={b.planet} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, color: b.hit ? '#c9a24d' : 'rgba(242,237,226,0.3)' }}>{GLYPH[b.planet]}</div>
                <div style={{ fontSize: 8.5, color: '#9d8fa3', marginTop: 2 }}>{(b.matchSign || '').slice(0, 3).toUpperCase()}</div>
              </div>
            ))}
          </div>

          {expanded && (
            <div style={{ marginTop: 14, borderTop: '1px solid rgba(201,162,77,0.25)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {profile._breakdown.map(b => (
                <div key={b.planet} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: '#e6e0d4' }}>{b.category}</span>
                  <span style={{ color: b.hit ? '#c9a24d' : '#7a6d80', fontSize: 11 }}>{b.hit ? '✓ aligned' : '○ friction'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchModal({ profile, onMessage, onKeepBrowsing }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,4,6,0.88)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ position: 'absolute', opacity: 0.35 }}><ZodiacWheel size={340} spin /></div>
      <div style={{ zIndex: 1 }}>
        <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 13, letterSpacing: 4, marginBottom: 8 }}>THE STARS ALIGNED</div>
        <div style={{ fontFamily: 'Playfair Display, serif', color: '#f2ede2', fontSize: 38, fontWeight: 600, marginBottom: 18 }}>It's a Match</div>
        <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 18px', background: profile.photoUrl ? `center/cover no-repeat url(${profile.photoUrl})` : '#2a1e33', border: '2px solid #c9a24d' }} />
s<div style={{ color: '#e6e0d4', fontSize: 15, marginBottom: 4, fontFamily: 'Playfair Display, serif' }}>You and {profile.name} liked each other</div>
        <div style={{ color: '#9d8fa3', fontSize: 12.5, marginBottom: 28 }}>{profile._score}/5 core placements aligned</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 220, margin: '0 auto' }}>
          <button onClick={() => onMessage(profile)} style={{ background: '#c9a24d', border: 'none', color: '#0a0808', fontFamily: 'Cinzel, serif', fontSize: 13, letterSpacing: 1.5, padding: '12px 0', borderRadius: 3, cursor: 'pointer' }}>SEND A MESSAGE</button>
          <button onClick={onKeepBrowsing} style={{ background: 'transparent', border: '1px solid rgba(230,224,212,0.35)', color: '#e6e0d4', fontFamily: 'Cinzel, serif', fontSize: 12, letterSpacing: 1.5, padding: '11px 0', borderRadius: 3, cursor: 'pointer' }}>KEEP BROWSING</button>
        </div>
      </div>
    </div>
  );
}

function ChatScreen({ profile, myId, token, onBack }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const pollRef = useRef(null);

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
    setMessages(m => [...m, { sender_id: myId, text }]);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0808', zIndex: 50, display: 'flex', flexDirection: 'column', maxWidth: 400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 16px', borderBottom: '1px solid rgba(201,162,77,0.25)' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#c9a24d', fontSize: 18, cursor: 'pointer' }}>←</button>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: profile.photoUrl ? `center/cover no-repeat url(${profile.photoUrl})` : '#2a1e33', border: '1px solid #c9a24d' }} />
        <div>
          <div style={{ fontFamily: 'Playfair Display, serif', color: '#f2ede2', fontSize: 16 }}>{profile.name}</div>
          <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 9.5, letterSpacing: 1 }}>{profile._score}/5 · {matchLabel(profile._score).toUpperCase()}</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ color: '#9d8fa3', fontSize: 12.5, textAlign: 'center', marginTop: 30, fontFamily: 'Playfair Display, serif', fontStyle: 'italic' }}>
            You matched with {profile.name}. Say hello.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.sender_id === myId ? 'flex-end' : 'flex-start',
            background: m.sender_id === myId ? '#c9a24d' : '#1c1420',
            color: m.sender_id === myId ? '#0a0808' : '#e6e0d4',
            border: m.sender_id === myId ? 'none' : '1px solid rgba(201,162,77,0.25)',
            borderRadius: 14, padding: '8px 13px', fontSize: 13.5, maxWidth: '75%',
          }}>{m.text}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 14, borderTop: '1px solid rgba(201,162,77,0.25)' }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Write something..." style={{ flex: 1, background: '#150f13', border: '1px solid rgba(201,162,77,0.3)', borderRadius: 20, padding: '10px 16px', color: '#e6e0d4', fontSize: 13.5, outline: 'none' }} />
        <button onClick={send} style={{ background: '#c9a24d', border: 'none', borderRadius: '50%', width: 40, height: 40, color: '#0a0808', cursor: 'pointer', fontSize: 15 }}>➤</button>
      </div>
    </div>
  );
}

export default function RealLoveSwipeApp({ onGoToSignup }) {
  const [session, setSession] = useState(null); // { userId, accessToken }
  const [myProfile, setMyProfile] = useState(null);
  const [deck, setDeck] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadError, setLoadError] = useState('');
  const [maxDistance, setMaxDistance] = useState(100);
  const [ageRange, setAgeRange] = useState([35, 65]);
  const [showFilters, setShowFilters] = useState(false);
  const [tierBanner, setTierBanner] = useState('');
  const [matchedProfile, setMatchedProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [activeChat, setActiveChat] = useState(null);

  const loadDeck = async (dist, ages) => {
    if (!session || !myProfile) return;
    setLoadStatus('loading'); setLoadError('');
    try {
      const candidates = await fetchCandidates(session.userId, session.accessToken, {
        maxMiles: dist, minAge: ages[0], maxAge: ages[1],
      });
      const photoMap = await fetchPhotos(candidates.map(c => c.id), session.accessToken);
      const scored = candidates.map(c => {
        const { score, breakdown } = computeMatch(myProfile, c);
        return { ...c, photoUrl: photoMap[c.id], _score: score, _breakdown: breakdown };
      }).sort((a, b) => b._score - a._score);
      setDeck(scored);
      setHistory([]);
      setTierBanner(scored[0] ? `Showing your ${scored[0]._score}/5 matches` : 'No matches in this range yet');
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
      const existing = await fetchMyMatches(sess.userId, sess.accessToken);
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
        id: partnerId,
        name: partnerProfile?.name || 'Match',
        city: partnerProfile?.city,
        photoUrl: photoMap[partnerId],
        _score: score,
      };
    }));
    } catch (e) {
      setLoadStatus('error'); setLoadError(e.message);
    }
  };

  useEffect(() => {
    if (session && myProfile) loadDeck(maxDistance, ageRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, myProfile]);

  const swipe = async (dir) => {
    const [current, ...rest] = deck;
    if (!current) return;
    setHistory(h => [...h, current]);
    setDeck(rest);
    if (rest[0] && rest[0]._score !== current._score) {
      setTierBanner(`Now showing your ${rest[0]._score}/5 matches`);
    }
    if (dir === 'right') {
      await sendLike(session.userId, current.id, session.accessToken);
      const match = await checkForMatch(session.userId, current.id, session.accessToken);
      if (match) {
        const withMatchId = { ...current, matchId: match.id };
        setMatches(m => [...m, withMatchId]);
        setMatchedProfile(withMatchId);
      }
    }
  };

  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setDeck(d => [prev, ...d]);
  };

  if (!session) return <LoginScreen onLogin={handleLogin} onGoToSignup={onGoToSignup} />;

  if (loadStatus === 'loading' || !myProfile) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0808', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9d8fa3', fontFamily: 'Cinzel, serif', fontSize: 13, letterSpacing: 1 }}>
        ✦ LOADING YOUR MATCHES...
      </div>
    );
  }

  if (loadStatus === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0808', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#c9899f', fontSize: 13, padding: 24, textAlign: 'center', gap: 12 }}>
        <div>{loadError}</div>
        <div style={{ color: '#6b6070', fontSize: 11.5 }}>
          Common cause: your profile is missing a latitude/longitude (use "Use my location" during signup) or has no photos yet.
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', width: '100%', background: '#0a0808', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 16px 40px', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500&display=swap');
        @keyframes wheelspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Crown size={26} />
        <span style={{ fontFamily: 'Cinzel, serif', color: '#e6e0d4', fontSize: 17, letterSpacing: 3 }}>REAL LOVE</span>
      </div>
      <div style={{ color: '#9d8fa3', fontSize: 11.5, marginBottom: 12, fontStyle: 'italic', fontFamily: 'Playfair Display, serif' }}>
        Welcome back, {myProfile.name}
      </div>

      <button onClick={() => setShowFilters(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid rgba(201,162,77,0.4)', borderRadius: 20, padding: '6px 16px', color: '#c9a24d', fontFamily: 'Cinzel, serif', fontSize: 10.5, letterSpacing: 1, cursor: 'pointer', marginBottom: 14 }}>
        ⚙ FILTERS · {maxDistance} MI · AGE {ageRange[0]}–{ageRange[1]}
      </button>

      {showFilters && (
        <div style={{ width: 320, background: 'rgba(21,15,19,0.9)', border: '1px solid rgba(201,162,77,0.3)', borderRadius: 8, padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e6e0d4', fontSize: 12.5, marginBottom: 6 }}><span>Distance</span><span style={{ color: '#c9a24d' }}>Up to {maxDistance} mi</span></div>
            <input type="range" min="5" max="100" step="5" value={maxDistance} onChange={e => setMaxDistance(Number(e.target.value))} style={{ width: '100%', accentColor: '#c9a24d' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e6e0d4', fontSize: 12.5, marginBottom: 6 }}><span>Age range</span><span style={{ color: '#c9a24d' }}>{ageRange[0]}–{ageRange[1]}</span></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input type="range" min="35" max="80" value={ageRange[0]} onChange={e => setAgeRange([Math.min(Number(e.target.value), ageRange[1]), ageRange[1]])} style={{ flex: 1, accentColor: '#c9a24d' }} />
              <input type="range" min="35" max="80" value={ageRange[1]} onChange={e => setAgeRange([ageRange[0], Math.max(Number(e.target.value), ageRange[0])])} style={{ flex: 1, accentColor: '#c9a24d' }} />
            </div>
          </div>
          <button onClick={() => { loadDeck(maxDistance, ageRange); setShowFilters(false); }} style={{ width: '100%', background: 'linear-gradient(135deg, #e8c37a, #a97f2e)', border: 'none', color: '#0a0808', fontFamily: 'Cinzel, serif', fontSize: 12, letterSpacing: 1.5, padding: '10px 0', borderRadius: 3, cursor: 'pointer' }}>APPLY FILTERS</button>
        </div>
      )}

      {matches.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          {matches.map(m => (
            <button key={m.matchId} onClick={() => setActiveChat(m)} style={{ width: 44, height: 44, borderRadius: '50%', background: m.photoUrl ? `center/cover no-repeat url(${m.photoUrl})` : '#2a1e33', border: '2px solid #c9a24d', cursor: 'pointer' }} title={`Message ${m.name}`} />
          ))}
        </div>
      )}

      {tierBanner && (
        <div style={{ fontFamily: 'Cinzel, serif', color: '#c9a24d', fontSize: 11, letterSpacing: 1.5, border: '1px solid rgba(201,162,77,0.4)', borderRadius: 20, padding: '6px 16px', marginBottom: 18 }}>
          {tierBanner.toUpperCase()}
        </div>
      )}

      <div style={{ position: 'relative', width: 320, height: 480 }}>
        {deck.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(201,162,77,0.35)', borderRadius: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <ZodiacWheel size={64} opacity={0.6} />
            <div style={{ fontFamily: 'Cinzel, serif', color: '#e6e0d4', fontSize: 15, letterSpacing: 1 }}>NO MORE PROFILES</div>
            {history.length > 0 && <button onClick={undo} style={{ background: 'transparent', border: '1px solid #c9a24d', color: '#c9a24d', padding: '7px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontFamily: 'Cinzel, serif' }}>GO BACK</button>}
          </div>
        )}
        {deck.slice(0, 3).reverse().map((profile, i, arr) => (
          <SwipeCard key={profile.id} profile={profile} isTop={i === arr.length - 1} zIndex={i} onSwipe={swipe} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 28, alignItems: 'center' }}>
        <button onClick={() => swipe('left')} disabled={!deck.length} style={{ width: 52, height: 52, borderRadius: '50%', border: '1px solid rgba(163,118,143,0.6)', background: '#150f13', color: '#a3768f', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={22} /></button>
        <button onClick={undo} disabled={!history.length} style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(230,224,212,0.25)', background: 'transparent', color: '#9d8fa3', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: history.length ? 1 : 0.3 }}><RotateCcw size={15} /></button>
        <button style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(201,162,77,0.6)', background: '#150f13', color: '#c9a24d', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Star size={19} /></button>
        <button onClick={() => swipe('right')} disabled={!deck.length} style={{ width: 52, height: 52, borderRadius: '50%', border: '1px solid #c9a24d', background: '#150f13', color: '#c9a24d', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Heart size={21} /></button>
      </div>

      {matchedProfile && <MatchModal profile={matchedProfile} onMessage={(p) => { setMatchedProfile(null); setActiveChat(p); }} onKeepBrowsing={() => setMatchedProfile(null)} />}
      {activeChat && <ChatScreen profile={activeChat} myId={session.userId} token={session.accessToken} onBack={() => setActiveChat(null)} />}
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: '#0f0a0d', border: '1px solid rgba(201,162,77,0.35)',
  borderRadius: 6, padding: '12px 14px', color: '#e6e0d4', fontSize: 14, outline: 'none',
};
