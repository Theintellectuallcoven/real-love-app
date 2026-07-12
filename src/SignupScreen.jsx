
import React, { useState, useEffect } from 'react';
import { User, Mail, Lock, Eye, EyeOff, MapPin, Shield,  Heart, Camera, X, Plus } from 'lucide-react';

const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const PLANET_FIELDS = [
  { key: 'sun', label: 'Sun', glyph: '☉' },
  { key: 'moon', label: 'Moon', glyph: '☽' },
  { key: 'mercury', label: 'Mercury', glyph: '☿' },
  { key: 'venus', label: 'Venus', glyph: '♀' },
  { key: 'mars', label: 'Mars', glyph: '♂' },
];

const MIN_AGE = 35;
const MAX_PHOTOS = 5;
const STEPS = ['Account', 'About You', 'Your Chart', 'Your Profile'];

// Draft copy — have this reviewed before treating it as final legal language.
const COMMUNITY_GUIDELINES = [
  { title: 'Be respectful', body: 'Treat every member the way you\u2019d want to be treated. No harassment, hate speech, threats, or degrading language, ever.' },
  { title: 'Be honest', body: 'Use real, recent photos of yourself and accurate information. Impersonation and catfishing are not tolerated.' },
  { title: 'Be mindful', body: 'This is a space for genuine connection. No unsolicited explicit content, no soliciting money, and no promoting other businesses or services.' },
  { title: 'Consequences', body: 'Any violation of these guidelines may result in immediate and permanent removal from Real Love, at our sole discretion, with no obligation to reinstate the account.' },
];

const JEWEL = {
  gold: '#d4af5f',
  goldDeep: '#a97f2e',
  ruby: '#b3384f',
  emerald: '#2f9166',
  sapphire: '#3f6fb0',
  amethyst: '#8a4fc7',
};
const PLANET_COLORS = { sun: JEWEL.gold, moon: JEWEL.sapphire, mercury: JEWEL.emerald, venus: JEWEL.ruby, mars: '#c94d4d' };

function calcAge(birthDateStr) {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ============================================================
// SUPABASE WIRING
// Supabase now issues a "Publishable key" (sb_publishable_...) instead of
// the older "anon key" — same purpose, safe to use here in client code.
// Never put the "Secret key" (sb_secret_...) in this file.
// ============================================================
const SUPABASE_URL = 'https://rwfuttkhagijvfnphzus.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_HfNzNy0SfOOEdfbavPdrPw_KPdPPlu_';

async function realSubmit(form) {
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ email: form.email, password: form.password }),
  });
  const authData = await authRes.json();
  if (!authRes.ok) throw new Error(authData.msg || 'Signup failed');
  const userId = authData.user?.id;
  const accessToken = authData.access_token;

  const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: userId,
      name: form.name,
      birth_date: form.birthDate,
      city: form.city,
      latitude: form.latitude,
      longitude: form.longitude,
      tagline: form.tagline,
      bio: form.bio,
      hobbies: form.hobbies,
      sun: form.sun, moon: form.moon, mercury: form.mercury, venus: form.venus, mars: form.mars,
      guidelines_agreed_at: new Date().toISOString(),
    }),
  });
  if (!profileRes.ok) {
    const err = await profileRes.json();
    throw new Error(err.message || 'Profile could not be saved');
  }

  // Upload each photo to Storage (bucket: profile-photos, path: userId/position.jpg),
  // then record its public URL + position in the profile_photos table.
  for (let i = 0; i < form.photos.length; i++) {
    const { file } = form.photos[i];
    const path = `${userId}/${i}.jpg`;

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/profile-photos/${path}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': file.type,
      },
      body: file,
    });
    if (!uploadRes.ok) continue; // one failed photo shouldn't block the whole signup

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/profile-photos/${path}`;
    await fetch(`${SUPABASE_URL}/rest/v1/profile_photos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ profile_id: userId, photo_url: publicUrl, position: i }),
    });
  }

  return profileRes.json();
}

async function mockSubmit(form) {
  await new Promise(r => setTimeout(r, 900));
  if (calcAge(form.birthDate) < MIN_AGE) {
    throw new Error(`Members must be ${MIN_AGE} or older to join Real Love.`);
  }
  return { id: 'demo-user', ...form };
}

// ============================================================
// BIRTH CHART CALCULATOR WIRING
// Point this at your existing Vercel-hosted synastry/birth-chart endpoint
// (the one using FreeAstroAPI via a serverless proxy). Leave it blank to
// keep the manual sign dropdowns as a fallback.
// Expected response shape: { sun, moon, mercury, venus, mars } — each a
// zodiac sign string like "Scorpio". Adjust the field mapping below if
// your endpoint returns a different shape.
// ============================================================
const CHART_CALCULATOR_URL = ''; // e.g. 'https://your-project.vercel.app/api/birth-chart'

async function calculateChart({ birthDate, birthTime, latitude, longitude }) {
  const res = await fetch(CHART_CALCULATOR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: birthDate,
      time: birthTime || '12:00', // noon estimate when birth time isn't provided
      latitude, longitude,
    }),
  });
  if (!res.ok) throw new Error('Chart calculation failed');
  const data = await res.json();
  // Adjust these keys if your endpoint's response shape differs.
  return {
    sun: data.sun, moon: data.moon, mercury: data.mercury, venus: data.venus, mars: data.mars,
  };
}

// ============================================================
// SIGNATURE VISUAL ELEMENTS
// ============================================================

function Crown({ size = 22 }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 48 34" fill="none">
      <path d="M4 30 L2 10 L14 20 L24 4 L34 20 L46 10 L44 30 Z" fill="url(#crownGrad)" stroke="#f0d799" strokeWidth="0.8" />
      <rect x="3" y="29" width="42" height="4" rx="1" fill="url(#crownGrad)" stroke="#f0d799" strokeWidth="0.8" />
      <circle cx="24" cy="4" r="2.4" fill={JEWEL.ruby} />
      <circle cx="14" cy="20" r="1.8" fill={JEWEL.sapphire} />
      <circle cx="34" cy="20" r="1.8" fill={JEWEL.emerald} />
      <defs>
        <linearGradient id="crownGrad" x1="0" y1="0" x2="0" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e8c37a" />
          <stop offset="1" stopColor="#a97f2e" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// Small zodiac wheel used as the "Astro Match" footer badge.
function WheelBadge({ size = 30 }) {
  const glyphs = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="none" stroke="#c9a24d" strokeWidth="1" />
      {glyphs.map((g, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + 36 * Math.cos(a);
        const y = 50 + 36 * Math.sin(a);
        return <text key={g} x={x} y={y} fill="#c9a24d" fontSize="8" textAnchor="middle" dominantBaseline="middle" opacity="0.8">{g}</text>;
      })}
      <text x="50" y="50" fill="#c9a24d" fontSize="12" textAnchor="middle" dominantBaseline="middle">★</text>
    </svg>
  );
}

// Faint gold rose outline — decorative accent on the hero photo, echoing the landing page.
function RoseOutline({ size = 90, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 130" style={style}>
      <g fill="none" stroke="#e8c37a" strokeWidth="1">
        <circle cx="50" cy="35" r="10" opacity="0.7" />
        <path d="M42 30 Q50 20 58 30 Q65 38 55 42 Q50 48 45 42 Q35 38 42 30 Z" opacity="0.6" />
        <path d="M50 45 C 46 65, 40 75, 44 95" opacity="0.6" />
        <path d="M44 65 Q34 62 32 70" opacity="0.5" />
        <path d="M46 80 Q56 76 60 84" opacity="0.5" />
      </g>
    </svg>
  );
}

function ConstellationLines({ style }) {
  return (
    <svg viewBox="0 0 300 200" style={style}>
      <g stroke="#e8c37a" strokeWidth="0.6" opacity="0.55">
        <line x1="40" y1="20" x2="90" y2="45" />
        <line x1="90" y1="45" x2="150" y2="30" />
        <line x1="150" y1="30" x2="200" y2="60" />
        <line x1="90" y1="45" x2="70" y2="90" />
      </g>
      <g fill="#f2c774">
        <circle cx="40" cy="20" r="1.6" />
        <circle cx="90" cy="45" r="2" />
        <circle cx="150" cy="30" r="1.4" />
        <circle cx="200" cy="60" r="1.8" />
        <circle cx="70" cy="90" r="1.4" />
      </g>
    </svg>
  );
}

// ============================================================
// STEP INDICATOR — circles connected by a dotted line with a small
// diamond marker between them, matching the approved design.
// ============================================================
function StepDots({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0, marginBottom: 30 }}>
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 90 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              border: `1.5px solid ${i <= step ? JEWEL.gold : 'rgba(230,224,212,0.25)'}`,
              background: i < step ? 'linear-gradient(135deg, #e8c37a, #a97f2e)' : 'transparent',
              color: i < step ? '#0a0808' : (i === step ? JEWEL.gold : '#6b6070'),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Playfair Display, serif', fontSize: 14, fontWeight: 600,
              boxShadow: i === step ? `0 0 14px ${JEWEL.gold}55` : 'none',
            }}>
              {i < step ? '✓' : i + 1}
            </div>
            <div style={{
              fontSize: 9.5, letterSpacing: 1, fontFamily: 'Cinzel, serif',
              color: i === step ? JEWEL.gold : '#6b6070',
            }}>
              {label.toUpperCase()}
            </div>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 44, height: 34, color: i < step ? JEWEL.gold : 'rgba(230,224,212,0.25)',
              fontSize: 10, letterSpacing: 2,
            }}>
              ✦ ┄ ┄
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ============================================================
// FORM CONTROLS — icon-in-field style matching the mockup
// ============================================================
function IconField({ icon: Icon, label, accent, ...props }) {
  return (
    <div>
      <div style={{ color: accent || '#9d8fa3', fontSize: 10.5, letterSpacing: 1, marginBottom: 6, fontWeight: accent ? 600 : 400 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ position: 'relative' }}>
        <Icon size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: accent || '#c9a24d', opacity: 0.85 }} />
        <input {...props} style={{ ...inputStyle, paddingLeft: 38, borderColor: accent ? `${accent}66` : inputStyle.borderColor }} />
      </div>
    </div>
  );
}

function PasswordField({ value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div style={{ color: '#9d8fa3', fontSize: 10.5, letterSpacing: 1, marginBottom: 6 }}>PASSWORD</div>
      <div style={{ position: 'relative' }}>
        <Lock size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#c9a24d', opacity: 0.85 }} />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder="At least 6 characters"
          style={{ ...inputStyle, paddingLeft: 38, paddingRight: 36 }}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9d8fa3', cursor: 'pointer', padding: 0, display: 'flex' }}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

function PlainField({ label, children }) {
  return (
    <div>
      <div style={{ color: '#9d8fa3', fontSize: 10.5, letterSpacing: 1, marginBottom: 6 }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}

function CardHeading({ children }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 22 }}>
      <div style={{ fontFamily: 'Playfair Display, serif', color: '#f2ede2', fontSize: 24, fontWeight: 700 }}>{children}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10, color: JEWEL.gold, opacity: 0.7 }}>
        <div style={{ width: 50, height: 1, background: 'linear-gradient(90deg, transparent, currentColor)' }} />
        <span style={{ fontSize: 10 }}>✦</span>
        <div style={{ width: 50, height: 1, background: 'linear-gradient(90deg, currentColor, transparent)' }} />
      </div>
    </div>
  );
}

export default function SignupScreen() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '', email: '', password: '', birthDate: '', birthTime: '', city: '', tagline: '',
    sun: '', moon: '', mercury: '', venus: '', mars: '',
    latitude: null, longitude: null,
    bio: '', hobbies: [], photos: [], // photos: array of { dataUrl, file } for preview + upload
  });
  const [hobbyDraft, setHobbyDraft] = useState('');
  const [agreedToGuidelines, setAgreedToGuidelines] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [locationStatus, setLocationStatus] = useState('idle'); // idle | requesting | success | error
  const [locationError, setLocationError] = useState('');
  const [chartStatus, setChartStatus] = useState('idle'); // idle | calculating | success | error | manual
  const [chartError, setChartError] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const age = calcAge(form.birthDate);
  const underAge = age !== null && age < MIN_AGE;
  const allPlanetsSet = PLANET_FIELDS.every(p => form[p.key]);

  const stepValid = [
    form.name && form.email && form.password.length >= 6 && agreedToGuidelines,
    form.birthDate && !underAge && form.city,
    allPlanetsSet,
    form.bio.trim().length > 0 && form.photos.length > 0, // at least a bio + 1 photo required; hobbies optional
  ];

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const addHobby = () => {
    const h = hobbyDraft.trim();
    if (!h || form.hobbies.includes(h)) { setHobbyDraft(''); return; }
    setForm(f => ({ ...f, hobbies: [...f.hobbies, h] }));
    setHobbyDraft('');
  };
  const removeHobby = (h) => setForm(f => ({ ...f, hobbies: f.hobbies.filter(x => x !== h) }));

  // Reads a chosen file as a data URL for instant preview. The real `file`
  // object is kept alongside it so it can be uploaded to Supabase Storage
  // (bucket: profile-photos) once this is wired to a live project.
  const addPhoto = (fileList) => {
    const files = Array.from(fileList).slice(0, MAX_PHOTOS - form.photos.length);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setForm(f => f.photos.length >= MAX_PHOTOS ? f : { ...f, photos: [...f.photos, { dataUrl: reader.result, file }] });
      };
      reader.readAsDataURL(file);
    });
  };
  const removePhoto = (idx) => setForm(f => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }));

  // Calls your Vercel birth chart calculator using birth date/time + coordinates.
  // Falls back to manual sign selection if no location was captured, if no
  // calculator URL is configured yet, or if the call itself fails.
  const runChartCalculation = async () => {
    if (!CHART_CALCULATOR_URL) { setChartStatus('manual'); return; }
    if (form.latitude == null || form.longitude == null) {
      setChartStatus('manual');
      setChartError('We need your location (from step 2) to calculate your chart precisely — switching to manual entry.');
      return;
    }
    setChartStatus('calculating');
    setChartError('');
    try {
      const result = await calculateChart({
        birthDate: form.birthDate, birthTime: form.birthTime,
        latitude: form.latitude, longitude: form.longitude,
      });
      setForm(f => ({ ...f, ...result }));
      setChartStatus('success');
    } catch (e) {
      setChartStatus('manual');
      setChartError('Couldn\u2019t reach the chart calculator — enter your placements manually below.');
    }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationError('Location isn\u2019t supported on this device/browser.');
      return;
    }
    setLocationStatus('requesting');
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setForm(f => ({ ...f, latitude, longitude }));
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await res.json();
          const place = data.address?.city || data.address?.town || data.address?.village || '';
          const state = data.address?.state || '';
          if (place) update('city', state ? `${place}, ${state}` : place);
        } catch (e) {
          // Reverse geocoding failing doesn't block signup — coordinates are already captured.
        }
        setLocationStatus('success');
      },
      (err) => {
        setLocationStatus('error');
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. You can still type your city manually.'
            : 'Couldn\u2019t detect your location. You can still type your city manually.'
        );
      }
    );
  };

  useEffect(() => {
    if (step === 2 && chartStatus === 'idle') {
      runChartCalculation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleSubmit = async () => {
    setStatus('submitting');
    setErrorMsg('');
    try {
      const submit = SUPABASE_URL ? realSubmit : mockSubmit;
      await submit(form);
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setErrorMsg(e.message);
    }
  };

  const fontImport = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,500&family=Dancing+Script:wght@600&display=swap');
      input, select { font-family: inherit; }
      input::placeholder { color: #5f5852; }
      input:focus, select:focus { border-color: #c9a24d !important; }
    `}</style>
  );

  if (status === 'success') {
    return (
      <div style={wrap}>
        {fontImport}
        <div style={{ position: 'relative', textAlign: 'center', padding: '110px 24px', maxWidth: 420, margin: '0 auto' }}>
          <Crown size={44} />
          <div style={{ fontFamily: 'Cinzel, serif', color: JEWEL.gold, fontSize: 12, letterSpacing: 3, marginTop: 16, marginBottom: 10 }}>
            WELCOME TO REAL LOVE
          </div>
          <div style={{ fontFamily: 'Playfair Display, serif', color: '#f2ede2', fontSize: 28, fontWeight: 700 }}>
            {form.name}, your chart is on file.
          </div>
          <div style={{ color: '#9d8fa3', fontSize: 13, marginTop: 12, lineHeight: 1.6 }}>
            {SUPABASE_URL ? 'Your profile was saved to Supabase.' : 'Demo mode — no real account was created.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      {fontImport}

      {/* ============ HERO ============ */}
      <div style={heroWrap}>
        <ConstellationLines style={{ position: 'absolute', top: 10, right: 20, width: 180, opacity: 0.9 }} />
        <RoseOutline size={80} style={{ position: 'absolute', top: 90, right: 40, opacity: 0.5 }} />
        <RoseOutline size={70} style={{ position: 'absolute', bottom: 10, right: 10, opacity: 0.4 }} />
        <div style={{ position: 'absolute', top: 130, right: 30, fontSize: 34, color: JEWEL.gold, opacity: 0.7 }}>♀</div>

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 260 }}>
          <Crown size={30} />
          <div style={{
            fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: '2.6rem', lineHeight: 0.95,
            marginTop: 6,
            background: `linear-gradient(180deg, #e8c37a, ${JEWEL.goldDeep})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            Real<br/>L♡ve
          </div>
          <div style={{ fontFamily: 'Cinzel, serif', color: JEWEL.gold, fontSize: 12, letterSpacing: 4, marginTop: 6 }}>
            ✦ ASTRO MATCH ✦
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0', color: JEWEL.gold, opacity: 0.6 }}>
            <div style={{ width: 40, height: 1, background: 'currentColor' }} />
            <Heart size={12} fill="currentColor" />
            <div style={{ width: 40, height: 1, background: 'currentColor' }} />
          </div>
          <div style={{ fontFamily: 'Cinzel, serif', color: '#f2ede2', fontSize: 13, letterSpacing: 1.5, lineHeight: 1.8 }}>
            35 AND UP<br/>INTELLECTUAL SINGLES
          </div>
        </div>
      </div>

      {/* ============ STEP FLOW ============ */}
      <div style={{ position: 'relative', padding: '34px 20px 0', maxWidth: 460, margin: '0 auto' }}>
        <StepDots step={step} />

        <div style={cardStyle}>
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <CardHeading>Create your account</CardHeading>
              <IconField icon={User} label="Full name" value={form.name} onChange={e => update('name', e.target.value)} placeholder="Aisha" />
              <IconField icon={Mail} label="Email" type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="you@email.com" />
              <PasswordField value={form.password} onChange={e => update('password', e.target.value)} />

              <div style={{ border: '1px solid rgba(201,162,77,0.3)', borderRadius: 6, padding: '12px 14px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={agreedToGuidelines}
                    onChange={e => setAgreedToGuidelines(e.target.checked)}
                    style={{ marginTop: 2, accentColor: JEWEL.gold, width: 15, height: 15, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 12, color: '#e6e0d4', lineHeight: 1.5 }}>
                    I agree to the{' '}
                    <span
                      onClick={(e) => { e.preventDefault(); setShowGuidelines(s => !s); }}
                      style={{ color: JEWEL.gold, textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      Community Guidelines
                    </span>
                    {' '}— be respectful, be honest, be mindful. Violations can result in permanent removal.
                  </span>
                </label>

                {showGuidelines && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(201,162,77,0.2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {COMMUNITY_GUIDELINES.map(g => (
                      <div key={g.title}>
                        <div style={{ fontFamily: 'Cinzel, serif', color: JEWEL.gold, fontSize: 11, letterSpacing: 1, marginBottom: 3 }}>
                          {g.title.toUpperCase()}
                        </div>
                        <div style={{ fontSize: 12, color: '#b8a99a', lineHeight: 1.5 }}>{g.body}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <CardHeading>Tell us about you</CardHeading>
              <PlainField label="Birth date">
                <input style={inputStyle} type="date" value={form.birthDate} onChange={e => update('birthDate', e.target.value)} />
              </PlainField>
              {age !== null && (
                <div style={{ fontSize: 12.5, marginTop: -10, color: underAge ? '#c9899f' : '#9d8fa3' }}>
                  {underAge
                    ? `Members must be ${MIN_AGE} or older to join Real Love. You entered an age of ${age}.`
                    : `Age ${age} — eligible to join.`}
                </div>
              )}
              <PlainField label="Birth time (optional, improves chart accuracy)">
                <input style={inputStyle} type="time" value={form.birthTime} onChange={e => update('birthTime', e.target.value)} />
              </PlainField>
              <div style={{ fontSize: 11, color: '#6b6070', marginTop: -10, lineHeight: 1.5 }}>
                Exact birth time lets us calculate your Moon, Mercury, Venus &amp; Mars precisely. Without it, we'll estimate using noon.
              </div>
              <PlainField label="City">
                <input style={inputStyle} value={form.city} onChange={e => update('city', e.target.value)} placeholder="Philadelphia, PA" />
              </PlainField>

              <button
                type="button"
                onClick={requestLocation}
                disabled={locationStatus === 'requesting'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'transparent', border: '1px solid rgba(201,162,77,0.4)', borderRadius: 20,
                  padding: '9px 0', color: '#c9a24d', fontFamily: 'Cinzel, serif', fontSize: 11,
                  letterSpacing: 1, cursor: locationStatus === 'requesting' ? 'default' : 'pointer',
                  marginTop: -6,
                }}
              >
                <MapPin size={13} />
                {locationStatus === 'requesting' ? 'DETECTING LOCATION...' : locationStatus === 'success' ? 'LOCATION DETECTED' : 'USE MY LOCATION'}
              </button>
              {locationStatus === 'success' && (
                <div style={{ fontSize: 11.5, color: '#9d8fa3', marginTop: -8, textAlign: 'center' }}>
                  This lets us show you matches by real distance, up to 100 miles away.
                </div>
              )}
              {locationStatus === 'error' && (
                <div style={{ fontSize: 11.5, color: '#c9899f', marginTop: -8, textAlign: 'center' }}>
                  {locationError}
                </div>
              )}

              <PlainField label="Tagline">
                <input style={inputStyle} value={form.tagline} onChange={e => update('tagline', e.target.value)} placeholder="A line that sounds like you" />
              </PlainField>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <CardHeading>Your chart</CardHeading>

              {chartStatus === 'calculating' && (
                <div style={{ textAlign: 'center', color: '#9d8fa3', fontSize: 12.5, padding: '10px 0' }}>
                  ✦ Calculating your chart from birth date, time &amp; location...
                </div>
              )}

              {chartStatus === 'success' && (
                <div style={{ textAlign: 'center', color: JEWEL.gold, fontSize: 12, fontFamily: 'Cinzel, serif', letterSpacing: 0.5, padding: '4px 0 6px' }}>
                  ✦ CALCULATED FROM YOUR BIRTH DATA
                </div>
              )}

              {chartStatus === 'manual' && chartError && (
                <div style={{ color: '#c9899f', fontSize: 11.5, textAlign: 'center', marginTop: -6 }}>
                  {chartError}
                </div>
              )}

              {chartStatus !== 'calculating' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {PLANET_FIELDS.map(p => (
                    <PlainField key={p.key} label={`${p.glyph} ${p.label}`}>
                      <select
                        style={{ ...inputStyle, borderColor: `${PLANET_COLORS[p.key]}66` }}
                        value={form[p.key]}
                        onChange={e => update(p.key, e.target.value)}
                      >
                        <option value="">Select sign</option>
                        {SIGNS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </PlainField>
                  ))}
                </div>
              )}

              {chartStatus === 'success' && (
                <button
                  type="button"
                  onClick={() => setChartStatus('manual')}
                  style={{ background: 'none', border: 'none', color: '#6b6070', fontSize: 11, textDecoration: 'underline', cursor: 'pointer', marginTop: 2 }}
                >
                  Adjust manually
                </button>
              )}
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <CardHeading>Your profile</CardHeading>

              <div>
                <div style={{ color: '#9d8fa3', fontSize: 10.5, letterSpacing: 1, marginBottom: 8 }}>
                  PHOTOS ({form.photos.length}/{MAX_PHOTOS})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  {form.photos.map((p, i) => (
                    <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', border: `1.5px solid ${i === 0 ? JEWEL.gold : 'rgba(201,162,77,0.35)'}` }}>
                      <img src={p.dataUrl} alt={`Profile ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {i === 0 && (
                        <div style={{ position: 'absolute', top: 2, left: 2, background: JEWEL.gold, color: '#0a0808', fontSize: 7, fontFamily: 'Cinzel, serif', padding: '1px 4px', borderRadius: 2 }}>MAIN</div>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        aria-label="Remove photo"
                        style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(10,8,8,0.75)', border: 'none', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e6e0d4', cursor: 'pointer' }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  {form.photos.length < MAX_PHOTOS && (
                    <label style={{
                      aspectRatio: '1', borderRadius: 6, border: '1.5px dashed rgba(201,162,77,0.4)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      color: JEWEL.gold, cursor: 'pointer', gap: 2,
                    }}>
                      <Camera size={16} />
                      <Plus size={9} />
                      <input type="file" accept="image/*" multiple hidden onChange={e => addPhoto(e.target.files)} />
                    </label>
                  )}
                </div>
                <div style={{ color: '#6b6070', fontSize: 10.5, marginTop: 8 }}>
                  Add at least 1 photo (up to 5). Your first photo is shown as your main profile picture.
                </div>
              </div>

              <div>
                <div style={{ color: '#9d8fa3', fontSize: 10.5, letterSpacing: 1, marginBottom: 8 }}>HOBBIES</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    style={inputStyle}
                    value={hobbyDraft}
                    onChange={e => setHobbyDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHobby(); } }}
                    placeholder="e.g. hiking, wine tasting, tarot"
                  />
                  <button type="button" onClick={addHobby} style={{
                    flex: '0 0 auto', background: 'rgba(201,162,77,0.15)', border: '1px solid rgba(201,162,77,0.4)',
                    color: JEWEL.gold, borderRadius: 6, padding: '0 16px', cursor: 'pointer', fontFamily: 'Cinzel, serif', fontSize: 11,
                  }}>ADD</button>
                </div>
                {form.hobbies.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {form.hobbies.map(h => (
                      <span key={h} style={{
                        display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(201,162,77,0.12)',
                        border: '1px solid rgba(201,162,77,0.3)', color: '#e6e0d4', borderRadius: 20,
                        padding: '4px 10px', fontSize: 12,
                      }}>
                        {h}
                        <X size={11} style={{ cursor: 'pointer', color: '#9d8fa3' }} onClick={() => removeHobby(h)} />
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <PlainField label="Bio">
                <textarea
                  value={form.bio}
                  onChange={e => update('bio', e.target.value.slice(0, 400))}
                  placeholder="Tell your future match a little about yourself..."
                  rows={5}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
                <div style={{ textAlign: 'right', color: '#6b6070', fontSize: 10.5, marginTop: 4 }}>
                  {form.bio.length}/400
                </div>
              </PlainField>
            </div>
          )}

          {status === 'error' && (
            <div style={{
              background: 'rgba(163,118,143,0.12)', border: '1px solid rgba(163,118,143,0.4)',
              borderRadius: 4, padding: '10px 14px', color: '#c9a3b5', fontSize: 12.5, marginTop: 16,
            }}>
              {errorMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} style={{
                flex: '0 0 auto', background: 'transparent', border: '1px solid rgba(230,224,212,0.3)',
                color: '#e6e0d4', fontFamily: 'Cinzel, serif', fontSize: 12.5, letterSpacing: 1,
                padding: '13px 20px', borderRadius: 4, cursor: 'pointer',
              }}>BACK</button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => stepValid[step] && setStep(s => s + 1)}
                disabled={!stepValid[step]}
                style={{
                  flex: 1, background: stepValid[step] ? 'linear-gradient(135deg, #e8c37a, #a97f2e)' : 'rgba(201,162,77,0.25)', border: 'none',
                  color: '#0a0808', fontFamily: 'Cinzel, serif', fontSize: 14, letterSpacing: 2,
                  padding: '15px 0', borderRadius: 4, cursor: stepValid[step] ? 'pointer' : 'not-allowed',
                }}
              >CONTINUE</button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!stepValid[STEPS.length - 1] || status === 'submitting'}
                style={{
                  flex: 1, background: stepValid[STEPS.length - 1] ? 'linear-gradient(135deg, #e8c37a, #a97f2e)' : 'rgba(201,162,77,0.25)', border: 'none',
                  color: '#0a0808', fontFamily: 'Cinzel, serif', fontSize: 14, letterSpacing: 2,
                  padding: '15px 0', borderRadius: 4, cursor: stepValid[STEPS.length - 1] ? 'pointer' : 'not-allowed',
                }}
              >{status === 'submitting' ? 'JOINING...' : 'JOIN REAL LOVE'}</button>
            )}
          </div>
        </div>

        {!SUPABASE_URL && (
          <div style={{ textAlign: 'center', color: '#6b6070', fontSize: 10.5, marginTop: 14 }}>
            Demo mode — add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the code to save real accounts.
          </div>
        )}

        {/* ============ TAGLINE ============ */}
        <div style={{ textAlign: 'center', marginTop: 34 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: JEWEL.gold, fontFamily: 'Cinzel, serif', fontSize: 10.5, letterSpacing: 2 }}>
            <Heart size={9} fill="currentColor" />
            <span>WRITTEN IN THE STARS. MATCHED BY LOVE.</span>
            <Heart size={9} fill="currentColor" />
          </div>
          <div style={{ fontFamily: 'Dancing Script, cursive', color: JEWEL.gold, fontSize: 20, marginTop: 6 }}>
            You can still match.
          </div>
        </div>

        {/* ============ FOOTER TRUST ROW ============ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, marginTop: 40, paddingTop: 30, borderTop: '1px solid rgba(201,162,77,0.15)' }}>
          <FooterItem icon={<Shield size={22} />} title="PRIVATE & SECURE" desc="Your journey is safe with us. Your data. Your love story. Your way." border />
          <FooterItem icon={<WheelBadge size={26} />} title="ASTRO MATCH" desc="We compare your Venus, Mars, Mercury, Sun & Moon to reveal your unique connection." border />
          <FooterItem icon={<Heart size={22} />} title="REAL CONNECTIONS" desc="Find intellectual singles who vibe with your energy, your purpose, and your mind." />
        </div>

        <div style={{ textAlign: 'center', fontFamily: 'Cinzel, serif', color: JEWEL.gold, fontSize: 10.5, letterSpacing: 2.5, opacity: 0.8, marginTop: 30, paddingBottom: 30 }}>
          REAL LOVE. REAL PEOPLE. REAL ASTROLOGY.
        </div>
      </div>
    </div>
  );
}

function FooterItem({ icon, title, desc, border }) {
  return (
    <div style={{
      textAlign: 'center', padding: '0 12px',
      borderRight: border ? '1px solid rgba(201,162,77,0.15)' : 'none',
    }}>
      <div style={{ color: JEWEL.gold, display: 'flex', justifyContent: 'center', marginBottom: 10 }}>{icon}</div>
      <div style={{ fontFamily: 'Cinzel, serif', color: JEWEL.gold, fontSize: 10.5, letterSpacing: 1, marginBottom: 8 }}>{title}</div>
      <div style={{ color: '#9d8fa3', fontSize: 11, lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

const wrap = {
  minHeight: '100vh', width: '100%',
  background: `
    radial-gradient(ellipse 550px 320px at 20% 8%, rgba(232,181,102,0.10), transparent),
    radial-gradient(ellipse 500px 300px at 85% 12%, rgba(212,77,77,0.08), transparent),
    #0a0808`,
  fontFamily: 'system-ui, sans-serif',
  position: 'relative', overflow: 'hidden', paddingBottom: 20,
};

const heroWrap = {
  position: 'relative',
  minHeight: 380,
  display: 'flex',
  alignItems: 'center',
  padding: '50px 26px',
  background: `linear-gradient(90deg, rgba(8,6,6,0.75) 30%, rgba(8,6,6,0.15) 75%), url('couple-hero.png') center 20% / cover no-repeat`,
  overflow: 'hidden',
};

const cardStyle = {
  background: 'rgba(15,10,13,0.8)',
  border: '1px solid rgba(212,175,95,0.35)', borderRadius: 12,
  padding: '32px 26px', backdropFilter: 'blur(4px)',
  boxShadow: '0 30px 80px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(212,175,95,0.08)',
};

const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: '#0f0a0d',
  border: '1px solid rgba(201,162,77,0.35)', borderRadius: 6,
  padding: '12px 13px', color: '#e6e0d4', fontSize: 13.5, outline: 'none',
  transition: 'border-color 0.15s',
};
