// ============================================
// REAL LOVE — Settings Screen (final)
// Save as: src/SettingsScreen.jsx
// Ready to use — no edits needed.
// ============================================
import React, { useState, useEffect, useRef } from 'react';
import { Camera, Plus, X } from 'lucide-react';

const SUPABASE_URL = 'https://rwfuttkhagijvfnphzus.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_HfNzNy0SfOOEdfbavPdrPw_KPdPPlu_';

const GOLD = '#c9a24d';
const GOLD_DIM = 'rgba(201,162,77,0.4)';
const INK = '#000000';

const MAX_PHOTOS = 5;
const NUM_PROMPTS = 3;

// Real Love's own "Catch a Vibe" prompts.
const PROMPT_QUESTIONS = [
  '',
  'My date night vibe is',
  'My hidden talent is',
  'My favorite movie is',
  'My favorite R&B song is',
  'My Sunday looks like',
  'My go-to karaoke song is',
  'The album I could play front to back is',
  'My comfort food is',
  'My Friday night looks like',
  'My dream vacation is',
  'My love language is',
  'You can find me on the dance floor when',
  "The way to my heart is",
  "I'm a little bit old school about",
  'My signature dish is',
  'The last show I binged was',
  'My guilty pleasure is',
  'I light up when we talk about',
  'My perfect Saturday morning is',
  'My cosmic green flag is',
  "I'll know it's Real Love when",
];
const LOOKING_FOR_OPTIONS = ['', 'Long-term relationship', 'Long-term, open to short', 'Short-term, open to long', 'Life partner', 'Still figuring it out'];
const POLITICS_OPTIONS = ['', 'Not political', 'Moderate', 'Liberal', 'Conservative', 'Other', 'Prefer not to say'];

// Real Love crown — matches the waitlist / deck logo (three-orb crown with a heart
// cut out of the center, metallic gold foil gradient).
function Crown({ size = 26 }) {
  return (
    <svg width={size} height={size * 0.65} viewBox="0 0 120 78" fill="none">
      <defs>
        <linearGradient id="rlSettingsFoil" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#8A6524" />
          <stop offset="30%" stopColor="#C9973F" />
          <stop offset="52%" stopColor="#F7E7BC" />
          <stop offset="72%" stopColor="#C9973F" />
          <stop offset="100%" stopColor="#8A6524" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="7" r="5.4" fill="url(#rlSettingsFoil)" />
      <circle cx="14" cy="20" r="4.4" fill="url(#rlSettingsFoil)" />
      <circle cx="106" cy="20" r="4.4" fill="url(#rlSettingsFoil)" />
      <path fill="url(#rlSettingsFoil)" d="M14 24 L36 52 L60 15 L84 52 L106 24 L102 70 Q60 78 18 70 Z" />
      <path fill="#000000" d="M60 44c-3.4-4-9-2.6-9 2.2 0 3.4 4.6 6.4 9 9.8 4.4-3.4 9-6.4 9-9.8 0-4.8-5.6-6.2-9-2.2z" />
    </svg>
  );
}

export default function SettingsScreen({ userId, accessToken, onBack, onLoggedOut }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [photoStatus, setPhotoStatus] = useState(''); // shown right under the photo grid
  const [bio, setBio] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [maxDistance, setMaxDistance] = useState(100);
  const [minAge, setMinAge] = useState(35);
  const [maxAge, setMaxAge] = useState(65);
  const [showMe, setShowMe] = useState('');        // 'man' | 'woman' | 'everyone' → profiles.seeking
  const [orientation, setOrientation] = useState(''); // profiles.sexual_orientation (optional)
  const [deleteText, setDeleteText] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  // ---- Prompts + details (Hinge-style) ----
  const [prompts, setPrompts] = useState(Array.from({ length: NUM_PROMPTS }, () => ({ question: '', answer: '' })));
  const [job, setJob] = useState('');
  const [lookingFor, setLookingFor] = useState('');
  const [religion, setReligion] = useState('');
  const [ethnicity, setEthnicity] = useState('');
  const [politics, setPolitics] = useState('');

  // ---- Photos ----
  const [photos, setPhotos] = useState([]); // [{ id, photo_url, position }]
  const [uploadingPositions, setUploadingPositions] = useState({}); // { [position]: true }
  const [dragIndex, setDragIndex] = useState(null); // index of the photo currently being dragged
  const photosRef = useRef(photos); // always-current photos, so the drop handler saves the latest order
  const dragStartOrderRef = useRef(''); // photo-id order when the drag began — skip saving if nothing moved
  useEffect(() => { photosRef.current = photos; }, [photos]);

  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`,
  };

  useEffect(() => {
    loadProfile();
    loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile() {
    setLoading(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=bio,height_feet,height_inches,max_distance,min_age,max_age,profile_extra,gender,seeking,sexual_orientation`,
        { headers }
      );
      const rows = await res.json();
      const p = Array.isArray(rows) ? rows[0] : null;
      if (p) {
        setBio(p.bio || '');
        setHeightFeet(p.height_feet ?? '');
        setHeightInches(p.height_inches ?? '');
        setMaxDistance(p.max_distance ?? 100);

        setMinAge(p.min_age ?? 35);
        setMaxAge(p.max_age ?? 65);
        const sk = Array.isArray(p.seeking) ? p.seeking : [];
        setShowMe(sk.length > 1 ? 'everyone' : (sk[0] || (p.gender === 'man' ? 'woman' : p.gender === 'woman' ? 'man' : '')));
        setOrientation(p.sexual_orientation || '');

        const extra = p.profile_extra || {};
        const savedPrompts = Array.isArray(extra.prompts) ? extra.prompts : [];
        setPrompts(Array.from({ length: NUM_PROMPTS }, (_, i) => ({
          question: savedPrompts[i]?.question || '',
          answer: savedPrompts[i]?.answer || '',
        })));
        const d = extra.details || {};
        setJob(d.job || '');
        setLookingFor(d.lookingFor || '');
        setReligion(d.religion || '');
        setEthnicity(d.ethnicity || '');
        setPolitics(d.politics || '');
      }
    } catch (err) {
      setStatus("Couldn't load your profile. Check your connection and try again.");
    }
    setLoading(false);
  }

  async function loadPhotos() {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profile_photos?profile_id=eq.${userId}&order=position.asc&select=id,photo_url,position`,
        { headers }
      );
      const rows = await res.json();
      setPhotos(Array.isArray(rows) ? rows : []);
    } catch (err) {
      // Non-fatal — the photo grid just starts out empty and the user can retry an upload.
    }
  }

  // Uploads the chosen file to Storage (bucket: profile-photos, path: userId/position.jpg,
  // same pattern as the Signup screen), then records/updates its URL in profile_photos.
  // x-upsert lets this overwrite a file that's already at that path (replacing a photo),
  // not just create a brand-new one (adding a photo).
  async function handlePhotoSelect(position, fileList) {
    const file = fileList && fileList[0];
    if (!file) return;
    setUploadingPositions(u => ({ ...u, [position]: true }));
    setPhotoStatus('');
    // Hard guard: never let the UI sit on "UPLOADING…" forever. If a request hangs,
    // abort it after 45s so the error surfaces instead of a stuck overlay.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    try {
      // Always upload under a NEW, unique filename rather than overwriting the same
      // path. Overwriting an existing object requires a storage UPDATE policy that the
      // bucket may not grant (that's what made replacing the main photo hang); a fresh
      // filename is a plain INSERT — the exact operation signup already does — and it
      // also dodges the CDN caching the old image at the same URL.
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${userId}/${position}-${Date.now()}.${ext}`;
      const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/profile-photos/${path}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': file.type || 'image/jpeg',
        },
        body: file,
        signal: controller.signal,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.message || err.error || `Upload failed (${uploadRes.status})`);
      }
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/profile-photos/${path}`;
      await upsertPhotoRow(position, publicUrl, controller.signal);
      await loadPhotos();
      setPhotoStatus('Photo updated ✓');
      setTimeout(() => setPhotoStatus(''), 2000);
    } catch (err) {
      const msg = err.name === 'AbortError'
        ? 'Upload timed out — check your connection and try again.'
        : err.message;
      setPhotoStatus(`Couldn't upload photo: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
      setUploadingPositions(u => {
        const next = { ...u };
        delete next[position];
        return next;
      });
    }
  }

  // Points this slot at the newly uploaded file. profile_photos has no confirmed unique
  // constraint on (profile_id, position), so this looks for an existing row at that
  // position and updates it in place (rather than an upsert-on-conflict), falling back to
  // inserting a new row when the slot was empty. Errors are thrown so they surface in the
  // status line instead of failing silently.
  async function upsertPhotoRow(position, photoUrl, signal) {
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profile_photos?profile_id=eq.${userId}&position=eq.${position}&select=id`,
      { headers, signal }
    );
    const existing = await existingRes.json();
    if (Array.isArray(existing) && existing.length) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profile_photos?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ photo_url: photoUrl }),
        signal,
      });
      const rows = await res.json().catch(() => null);
      if (!res.ok) throw new Error((rows && (rows.message || rows.error)) || `Couldn't update photo record (${res.status})`);
      // A 200 that updated zero rows means an RLS UPDATE policy blocked it silently.
      if (Array.isArray(rows) && rows.length === 0) {
        throw new Error('the app is not allowed to update this photo record (Supabase RLS). Tell Claude and it will add the policy.');
      }
    } else {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profile_photos`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ profile_id: userId, photo_url: photoUrl, position }),
        signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || `Couldn't save photo record (${res.status})`);
      }
    }
  }

  // Profiles are only visible in the deck once they have at least one photo row (RLS
  // policy), so removing the last photo would make this account disappear for everyone.
  async function removePhoto(position) {
    if (photos.length <= 1) {
      setPhotoStatus('You need at least one photo — add a new one before removing this.');
      return;
    }
    const row = photos.find(p => p.position === position);
    if (!row) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profile_photos?id=eq.${row.id}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPhotoStatus(`Couldn't remove photo: ${err.message || res.status}`);
        return;
      }
      // Best-effort cleanup of the stored file — a failure here shouldn't block the removal.
      fetch(`${SUPABASE_URL}/storage/v1/object/profile-photos`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ prefixes: [`${userId}/${position}.jpg`] }),
      }).catch(() => {});
      await loadPhotos();
    } catch (err) {
      setPhotoStatus("Couldn't remove photo. Check your connection and try again.");
    }
  }

  // ---- Drag-to-reorder (works with mouse and touch via pointer events) ----
  // Grab a photo and drag it over another to rearrange. The first photo (index 0) is
  // the "main" one the deck shows. On drop, positions 0..n-1 are written to the DB.
  function onPhotoDragStart(e, index) {
    dragStartOrderRef.current = photosRef.current.map(p => p.id).join(',');
    setDragIndex(index);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }

  function onPhotoDragMove(e) {
    if (dragIndex === null) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tile = el && el.closest && el.closest('[data-photo-index]');
    if (!tile) return;
    const over = Number(tile.getAttribute('data-photo-index'));
    if (Number.isNaN(over) || over === dragIndex) return;
    // Live-reorder the array as you drag over a new tile.
    setPhotos(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(dragIndex, 1);
      arr.splice(over, 0, moved);
      return arr;
    });
    setDragIndex(over);
  }

  function onPhotoDragEnd() {
    if (dragIndex === null) return;
    setDragIndex(null);
    // Wait one tick so photosRef holds the final on-screen order, and only save if it changed.
    setTimeout(() => {
      if (photosRef.current.map(p => p.id).join(',') !== dragStartOrderRef.current) persistPhotoOrder();
    }, 0);
  }

  // Save the current on-screen order to the DB (position = index). Done in TWO passes
  // so it works even if there's a unique (profile_id, position) constraint: first move
  // every row to a temporary high position (no collisions), then set the final 0..n-1.
  async function persistPhotoOrder() {
    const ordered = photosRef.current;
    setPhotoStatus('Saving new order…');
    console.log('[photos] saving order', ordered.map(p => p.id));
    const patchPosition = async (id, position) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profile_photos?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ position }),
      });
      const rows = await res.json().catch(() => null);
      if (!res.ok) throw new Error((rows && (rows.message || rows.error)) || `save failed (${res.status})`);
      // return=representation gives back the updated row; zero rows means an RLS policy
      // silently blocked the update (the classic "looks saved but reverts" cause).
      if (Array.isArray(rows) && rows.length === 0) {
        throw new Error('not allowed to reorder (Supabase RLS on profile_photos)');
      }
    };
    try {
      // Pass 1: park everything out of the way at 1000, 1001, 1002…
      await Promise.all(ordered.map((p, idx) => patchPosition(p.id, 1000 + idx)));
      // Pass 2: set the real order 0, 1, 2…
      await Promise.all(ordered.map((p, idx) => patchPosition(p.id, idx)));
      await loadPhotos();
      setPhotoStatus('Order saved ✓');
      setTimeout(() => setPhotoStatus(''), 2500);
    } catch (err) {
      console.error('[photos] reorder failed', err);
      setPhotoStatus(`Couldn't save the new order: ${err.message}`);
      await loadPhotos();
    }
  }

  async function saveProfile() {
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        // return=representation makes PostgREST hand back the updated row, so we
        // can tell a real save from an RLS-blocked no-op (which returns 200 but
        // updates zero rows and would otherwise look like a phantom success).
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          bio: bio.trim(),
          height_feet: heightFeet === '' ? null : Number(heightFeet),
          height_inches: heightInches === '' ? null : Number(heightInches),
          max_distance: Number(maxDistance),
          min_age: Number(minAge),
          max_age: Number(maxAge),
          ...(showMe ? { seeking: showMe === 'everyone' ? ['man', 'woman'] : [showMe] } : {}),
          sexual_orientation: orientation || null,
          profile_extra: {
            prompts: prompts
              .filter(p => p.question && p.answer.trim())
              .map(p => ({ question: p.question, answer: p.answer.trim() })),
            details: {
              job: job.trim(),
              lookingFor,
              religion: religion.trim(),
              ethnicity: ethnicity.trim(),
              politics,
            },
          },
        }),
      });
      const rows = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus(`Couldn't save: ${(rows && (rows.message || rows.error)) || res.status}`);
      } else if (Array.isArray(rows) && rows.length === 0) {
        setStatus("Couldn't save — the app isn't allowed to update your profile yet. Run the profiles update policy in Supabase.");
      } else {
        setStatus('Saved ✓');
        setTimeout(() => setStatus(''), 2500);
      }
    } catch (err) {
      setStatus("Couldn't save. Check your connection and try again.");
    }
    setSaving(false);
  }

  async function deleteAccount() {
    if (deleteText !== 'DELETE') return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_my_account`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStatus(`Couldn't delete account: ${err.message || res.status}`);
        return;
      }
      if (onLoggedOut) onLoggedOut();
    } catch (err) {
      setStatus("Couldn't delete account. Check your connection and try again.");
    }
  }

  // photos come back ordered by position asc, so index 0 is the "main" pic the deck shows.
  // A new photo is added after the last one.
  const nextPosition = photos.length ? Math.max(...photos.map(p => p.position)) + 1 : 0;

  return (
    <div style={styles.overlay}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Montserrat:wght@400;500;600&family=Dancing+Script:wght@600&display=swap');
        * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        .rl-set-btn { transition: transform 0.14s cubic-bezier(.2,.8,.2,1), filter 0.14s ease; }
        .rl-set-btn:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.08); }
        .rl-set-btn:active:not(:disabled) { transform: scale(0.96); }
        .rl-set-card { transition: border-color 0.15s ease; }
      `}</style>
      {/* celestial glow behind the top of the settings sheet */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 280, background: 'radial-gradient(120% 100% at 50% 0%, rgba(201,151,63,0.16), rgba(0,0,0,0) 68%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ ...styles.inner, position: 'relative', zIndex: 1 }}>
        <button style={styles.backBtn} onClick={onBack}>← BACK</button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 22 }}>
          <Crown size={30} />
          <h1 style={styles.title}>SETTINGS</h1>
        </div>

        {loading ? (
          <p style={styles.dimText}>✦ LOADING...</p>
        ) : (
          <>
            {/* ---- Photos ---- */}
            <section style={styles.card}>
              <h2 style={styles.sectionLabel}>PICTURE ME</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {photos.map((photo, index) => (
                  <PhotoTile
                    key={photo.id}
                    photo={photo}
                    index={index}
                    uploading={!!uploadingPositions[photo.position]}
                    dragging={dragIndex === index}
                    onReplace={(files) => handlePhotoSelect(photo.position, files)}
                    onRemove={() => removePhoto(photo.position)}
                    onDragStart={onPhotoDragStart}
                    onDragMove={onPhotoDragMove}
                    onDragEnd={onPhotoDragEnd}
                  />
                ))}
                {photos.length < MAX_PHOTOS && (
                  <AddPhotoTile
                    uploading={!!uploadingPositions[nextPosition]}
                    onSelect={(files) => handlePhotoSelect(nextPosition, files)}
                  />
                )}
              </div>
              <div style={{ color: '#7a7a7a', fontSize: 10.5, marginTop: 8, lineHeight: 1.5 }}>
                Drag a photo to reorder — the first one is your main pic, shown in the deck. Tap the camera to replace it, the ✕ to remove.
              </div>
              {photoStatus && (
                <div style={{ marginTop: 8, fontSize: 12, color: /couldn|need at least/i.test(photoStatus) ? '#ffffff' : GOLD }}>{photoStatus}</div>
              )}
            </section>

            {/* ---- Profile ---- */}
            <section style={styles.card}>
              <h2 style={styles.sectionLabel}>MY VIBE</h2>

              <label style={styles.fieldLabel}>Bio</label>
              <textarea
                style={{ ...styles.input, minHeight: 90, resize: 'vertical' }}
                value={bio}
                maxLength={500}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell them who you are..."
              />

              <label style={styles.fieldLabel}>Height</label>
              <div style={{ display: 'flex', gap: 12 }}>
                <select
                  style={{ ...styles.input, flex: 1 }}
                  value={heightFeet}
                  onChange={(e) => setHeightFeet(e.target.value)}
                >
                  <option value="">Feet</option>
                  {[4, 5, 6, 7].map((f) => (
                    <option key={f} value={f}>{f} ft</option>
                  ))}
                </select>
                <select
                  style={{ ...styles.input, flex: 1 }}
                  value={heightInches}
                  onChange={(e) => setHeightInches(e.target.value)}
                >
                  <option value="">Inches</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i}>{i} in</option>
                  ))}
                </select>
              </div>
            </section>

            {/* ---- Prompts ---- */}
            <section style={styles.card}>
              <h2 style={styles.sectionLabel}>CATCH A VIBE</h2>
              <div style={{ color: '#7a7a7a', fontSize: 10.5, marginBottom: 6, lineHeight: 1.5 }}>
                Pick a question and answer it — these show as cards on your profile.
              </div>
              {prompts.map((pr, i) => (
                <div key={i} style={{ marginTop: i === 0 ? 4 : 14 }}>
                  <select
                    style={{ ...styles.input, marginBottom: 6 }}
                    value={pr.question}
                    onChange={(e) => setPrompts(ps => ps.map((x, j) => j === i ? { ...x, question: e.target.value } : x))}
                  >
                    {(pr.question && !PROMPT_QUESTIONS.includes(pr.question)
                      ? [...PROMPT_QUESTIONS, pr.question] // keep an older saved prompt selectable
                      : PROMPT_QUESTIONS
                    ).map(q => (
                      <option key={q} value={q}>{q === '' ? '— choose a prompt —' : q}</option>
                    ))}
                  </select>
                  {pr.question && (
                    <textarea
                      style={{ ...styles.input, minHeight: 54, resize: 'vertical' }}
                      value={pr.answer}
                      maxLength={200}
                      placeholder="Your answer..."
                      onChange={(e) => setPrompts(ps => ps.map((x, j) => j === i ? { ...x, answer: e.target.value } : x))}
                    />
                  )}
                </div>
              ))}
            </section>

            {/* ---- More about you ---- */}
            <section style={styles.card}>
              <h2 style={styles.sectionLabel}>MORE ABOUT YOU</h2>

              <label style={styles.fieldLabel}>Job / work</label>
              <input style={styles.input} value={job} maxLength={80}
                onChange={(e) => setJob(e.target.value)} placeholder="e.g. Astrologer & entrepreneur" />

              <label style={styles.fieldLabel}>Looking for</label>
              <select style={styles.input} value={lookingFor} onChange={(e) => setLookingFor(e.target.value)}>
                {LOOKING_FOR_OPTIONS.map(o => (
                  <option key={o} value={o}>{o === '' ? '— select —' : o}</option>
                ))}
              </select>

              <label style={styles.fieldLabel}>Faith / spirituality</label>
              <input style={styles.input} value={religion} maxLength={40}
                onChange={(e) => setReligion(e.target.value)} placeholder="e.g. Spiritual" />

              <label style={styles.fieldLabel}>Ethnicity</label>
              <input style={styles.input} value={ethnicity} maxLength={40}
                onChange={(e) => setEthnicity(e.target.value)} placeholder="e.g. Black/African descent" />

              <label style={styles.fieldLabel}>Politics</label>
              <select style={styles.input} value={politics} onChange={(e) => setPolitics(e.target.value)}>
                {POLITICS_OPTIONS.map(o => (
                  <option key={o} value={o}>{o === '' ? '— select —' : o}</option>
                ))}
              </select>
            </section>

            {/* ---- Discovery ---- */}
            <section style={styles.card}>
              <h2 style={styles.sectionLabel}>DISCOVERY</h2>

              <label style={styles.fieldLabel}>Show me</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['woman', 'Women'], ['man', 'Men'], ['everyone', 'Everyone']].map(([val, label]) => (
                  <button key={val} type="button" className="rl-set-btn" onClick={() => setShowMe(val)}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 20, cursor: 'pointer', fontFamily: 'Cinzel, serif', fontSize: 11, letterSpacing: 1,
                      border: `1px solid ${showMe === val ? 'rgba(247,231,188,0.8)' : GOLD_DIM}`,
                      background: showMe === val ? 'linear-gradient(135deg, #f7e7bc, #c9973f)' : 'transparent',
                      color: showMe === val ? '#000000' : '#ffffff', fontWeight: showMe === val ? 700 : 500 }}>
                    {label.toUpperCase()}
                  </button>
                ))}
              </div>

              <label style={styles.fieldLabel}>Orientation <span style={{ color: '#7a7a7a' }}>(optional)</span></label>
              <select style={styles.input} value={orientation} onChange={(e) => setOrientation(e.target.value)}>
                {['', 'Straight', 'Gay', 'Lesbian', 'Bisexual', 'Pansexual', 'Queer', 'Prefer not to say'].map(o => (
                  <option key={o} value={o}>{o === '' ? '— select —' : o}</option>
                ))}
              </select>

              <label style={styles.fieldLabel}>Max distance — <span style={{ color: GOLD }}>{maxDistance} mi</span></label>
              <input type="range" min={5} max={100} value={maxDistance}
                onChange={(e) => setMaxDistance(Number(e.target.value))}
                style={{ width: '100%', accentColor: GOLD }} />

              <label style={styles.fieldLabel}>
                Age range — <span style={{ color: GOLD }}>{minAge}–{maxAge}</span>
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input type="range" min={35} max={80} value={minAge}
                  onChange={(e) => setMinAge(Math.min(Number(e.target.value), maxAge))}
                  style={{ flex: 1, accentColor: GOLD }} />
                <input type="range" min={35} max={80} value={maxAge}
                  onChange={(e) => setMaxAge(Math.max(Number(e.target.value), minAge))}
                  style={{ flex: 1, accentColor: GOLD }} />
              </div>
            </section>

            <button className="rl-set-btn" style={styles.saveBtn} onClick={saveProfile} disabled={saving}>
              {saving ? 'SAVING...' : 'SAVE CHANGES'}
            </button>
            {status && <p style={styles.status}>{status}</p>}

            {/* ---- Account ---- */}
            <section style={styles.card}>
              <h2 style={styles.sectionLabel}>ACCOUNT</h2>

              <button className="rl-set-btn" style={styles.outlineBtn} onClick={onLoggedOut}>
                LOG OUT
              </button>

              {!showDelete ? (
                <button
                  style={styles.dangerLink}
                  onClick={() => setShowDelete(true)}
                >
                  Delete my account
                </button>
              ) : (
                <div style={styles.dangerZone}>
                  <p style={styles.dangerText}>
                    This permanently deletes your profile, photos, matches, and
                    messages. This cannot be undone. Type <strong>DELETE</strong> to
                    confirm.
                  </p>
                  <input
                    style={styles.input}
                    value={deleteText}
                    onChange={(e) => setDeleteText(e.target.value)}
                    placeholder="Type DELETE"
                  />
                  <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                    <button
                      className="rl-set-btn"
                      style={{
                        ...styles.deleteBtn,
                        opacity: deleteText === 'DELETE' ? 1 : 0.4,
                      }}
                      disabled={deleteText !== 'DELETE'}
                      onClick={deleteAccount}
                    >
                      DELETE FOREVER
                    </button>
                    <button
                      className="rl-set-btn"
                      style={styles.outlineBtn}
                      onClick={() => { setShowDelete(false); setDeleteText(''); }}
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// One existing photo in the grid. Drag it (mouse or touch) to reorder; tap the camera
// to replace it, the X to remove. index 0 is the main pic (shown in the deck).
function PhotoTile({ photo, index, uploading, dragging, onReplace, onRemove, onDragStart, onDragMove, onDragEnd }) {
  const inputId = `settings-photo-${photo.id}`;
  const isMain = index === 0;
  return (
    <div
      data-photo-index={index}
      style={{
        position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden',
        border: `1.5px solid ${isMain ? 'rgba(240,215,153,0.75)' : GOLD_DIM}`,
        opacity: dragging ? 0.5 : 1,
        transform: dragging ? 'scale(1.08)' : 'none',
        boxShadow: dragging ? '0 12px 28px rgba(0,0,0,0.6)' : (isMain ? '0 0 16px rgba(201,162,77,0.28), inset 0 1px 0 rgba(247,231,188,0.2)' : 'inset 0 1px 0 rgba(247,231,188,0.08)'),
        transition: 'transform 0.12s ease, opacity 0.12s ease',
        touchAction: 'none',
      }}
    >
      <img src={photo.photo_url} alt={`Slot ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />

      {/* Drag layer — sits over the image but under the corner buttons, so dragging the
          image reorders while the camera/X buttons stay tappable. */}
      <div
        onPointerDown={(e) => { if (!uploading) onDragStart(e, index); }}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: uploading ? 'default' : (dragging ? 'grabbing' : 'grab'), touchAction: 'none' }}
      />

      {isMain && !uploading && (
        <div style={{ position: 'absolute', top: 3, left: 3, zIndex: 2, background: 'linear-gradient(135deg, #f7e7bc, #c9973f)', color: '#000000', fontWeight: 700, fontSize: 7, fontFamily: 'Cinzel, serif', letterSpacing: 0.5, padding: '2px 5px', borderRadius: 4, boxShadow: '0 2px 6px rgba(201,151,63,0.5)' }}>MAIN</div>
      )}

      {uploading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 3, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD, fontSize: 8, fontFamily: 'Cinzel, serif', letterSpacing: 0.5, textAlign: 'center', padding: 2 }}>
          UPLOADING...
        </div>
      )}

      {!uploading && (
        <>
          <button type="button" onClick={onRemove} aria-label="Remove photo"
            style={{ position: 'absolute', top: 4, right: 4, zIndex: 3, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', border: '1px solid rgba(240,215,153,0.35)', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer' }}>
            <X size={11} />
          </button>

          <label htmlFor={inputId} title="Replace photo"
            style={{ position: 'absolute', bottom: 4, right: 4, zIndex: 3, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', border: '1px solid rgba(240,215,153,0.4)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f0d799', cursor: 'pointer' }}>
            <Camera size={11} />
          </label>
        </>
      )}

      <input id={inputId} type="file" accept="image/*" hidden disabled={uploading}
        onChange={(e) => onReplace(e.target.files)}
        onClick={(e) => { e.target.value = null; }} />
    </div>
  );
}

// The empty "add a photo" tile at the end of the grid.
function AddPhotoTile({ uploading, onSelect }) {
  const inputId = 'settings-photo-add';
  return (
    <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${GOLD_DIM}`, background: 'linear-gradient(158deg, #121212, #060606)' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 12, border: '1.5px dashed rgba(201,162,77,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: GOLD, gap: 2 }}>
        {uploading ? (
          <span style={{ fontSize: 8, fontFamily: 'Cinzel, serif', letterSpacing: 0.5 }}>UPLOADING...</span>
        ) : (
          <><Camera size={16} /><Plus size={9} /></>
        )}
      </div>
      <label htmlFor={inputId} style={{ position: 'absolute', inset: 0, cursor: uploading ? 'default' : 'pointer' }} />
      <input id={inputId} type="file" accept="image/*" hidden disabled={uploading}
        onChange={(e) => onSelect(e.target.files)}
        onClick={(e) => { e.target.value = null; }} />
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: INK,
    zIndex: 70,
    overflowY: 'auto',
  },
  inner: {
    maxWidth: 400,
    margin: '0 auto',
    padding: '24px 20px 60px',
    color: '#ffffff',
    fontFamily: "'Cormorant Garamond', serif",
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: GOLD,
    fontFamily: 'Cinzel, serif',
    fontSize: 12,
    letterSpacing: 1.5,
    cursor: 'pointer',
    padding: 0,
    marginBottom: 18,
  },
  title: {
    color: '#ffffff',
    fontFamily: 'Cinzel, serif',
    letterSpacing: 5,
    fontWeight: 500,
    fontSize: 20,
    textAlign: 'center',
    margin: 0,
  },
  card: {
    border: '1px solid rgba(201,162,77,0.3)',
    borderRadius: 18,
    padding: '20px 22px',
    marginBottom: 18,
    background: 'linear-gradient(158deg, #141414 0%, #050505 100%)',
    boxShadow: '0 16px 40px -14px rgba(0,0,0,0.6), inset 0 1px 0 rgba(247,231,188,0.1)',
  },
  sectionLabel: {
    color: GOLD,
    fontFamily: 'Cinzel, serif',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: 500,
    margin: '0 0 14px',
  },
  fieldLabel: {
    display: 'block',
    color: '#ffffff',
    fontSize: 12.5,
    margin: '12px 0 6px',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(8,8,8,0.9)',
    border: '1px solid rgba(201,162,77,0.35)',
    borderRadius: 12,
    color: '#ffffff',
    padding: '13px 16px',
    fontSize: 14,
    fontFamily: "'Cormorant Garamond', serif",
    outline: 'none',
    boxShadow: 'inset 0 1px 0 rgba(247,231,188,0.06)',
  },
  saveBtn: {
    width: '100%',
    background: 'linear-gradient(135deg, #f7e7bc, #c9973f)',
    color: '#000000',
    border: '1px solid rgba(247,231,188,0.7)',
    borderRadius: 28,
    padding: '14px 0',
    fontFamily: 'Cinzel, serif',
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 1.5,
    cursor: 'pointer',
    marginBottom: 8,
    boxShadow: '0 10px 26px rgba(201,151,63,0.5), inset 0 1px 0 rgba(255,255,255,0.4)',
  },
  outlineBtn: {
    background: 'transparent',
    border: `1px solid ${GOLD}`,
    color: GOLD,
    borderRadius: 20,
    padding: '9px 20px',
    fontFamily: 'Cinzel, serif',
    fontSize: 11,
    letterSpacing: 1.5,
    cursor: 'pointer',
  },
  dangerLink: {
    display: 'block',
    background: 'none',
    border: 'none',
    color: '#c2ac93',
    fontSize: 12.5,
    cursor: 'pointer',
    marginTop: 16,
    padding: 0,
    textDecoration: 'underline',
  },
  dangerZone: {
    marginTop: 16,
    borderTop: '1px solid rgba(255,255,255,0.35)',
    paddingTop: 14,
  },
  dangerText: {
    color: '#ffffff',
    fontSize: 12.5,
    lineHeight: 1.6,
  },
  deleteBtn: {
    background: '#a3384f',
    color: '#ffffff',
    border: 'none',
    borderRadius: 20,
    padding: '9px 20px',
    fontFamily: 'Cinzel, serif',
    fontSize: 11,
    letterSpacing: 1.5,
    cursor: 'pointer',
  },
  status: {
    color: GOLD,
    textAlign: 'center',
    fontSize: 13,
    margin: '4px 0 18px',
  },
  dimText: {
    color: '#bdbdbd',
    textAlign: 'center',
    marginTop: 60,
    fontFamily: 'Cinzel, serif',
    fontSize: 12,
    letterSpacing: 1.5,
  },
};
