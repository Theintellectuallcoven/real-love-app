// ============================================
// REAL LOVE — Settings Screen (final)
// Save as: src/SettingsScreen.jsx
// Ready to use — no edits needed.
// ============================================
import React, { useState, useEffect } from 'react';

const SUPABASE_URL = 'https://rwfuttkhagijvfnphzus.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_HfNzNy0SfOOEdfbavPdrPw_KPdPPlu_';

const GOLD = '#c9a24d';
const GOLD_DIM = 'rgba(201,162,77,0.4)';
const INK = '#0a0808';

export default function SettingsScreen({ userId, accessToken, onBack, onLoggedOut }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [bio, setBio] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [maxDistance, setMaxDistance] = useState(100);
  const [deleteText, setDeleteText] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`,
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile() {
    setLoading(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=bio,height_feet,height_inches,max_distance`,
        { headers }
      );
      const rows = await res.json();
      const p = Array.isArray(rows) ? rows[0] : null;
      if (p) {
        setBio(p.bio || '');
        setHeightFeet(p.height_feet ?? '');
        setHeightInches(p.height_inches ?? '');
        setMaxDistance(p.max_distance ?? 100);
      }
    } catch (err) {
      setStatus("Couldn't load your profile. Check your connection and try again.");
    }
    setLoading(false);
  }

  async function saveProfile() {
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          bio: bio.trim(),
          height_feet: heightFeet === '' ? null : Number(heightFeet),
          height_inches: heightInches === '' ? null : Number(heightInches),
          max_distance: Number(maxDistance),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStatus(`Couldn't save: ${err.message || res.status}`);
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

  return (
    <div style={styles.overlay}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500&display=swap');`}</style>
      <div style={styles.inner}>
        <button style={styles.backBtn} onClick={onBack}>← BACK</button>

        <h1 style={styles.title}>SETTINGS</h1>

        {loading ? (
          <p style={styles.dimText}>✦ LOADING...</p>
        ) : (
          <>
            {/* ---- Profile ---- */}
            <section style={styles.card}>
              <h2 style={styles.sectionLabel}>PROFILE</h2>

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

            {/* ---- Discovery ---- */}
            <section style={styles.card}>
              <h2 style={styles.sectionLabel}>DISCOVERY</h2>
              <label style={styles.fieldLabel}>
                Max distance — <span style={{ color: GOLD }}>{maxDistance} miles</span>
              </label>
              <input
                type="range"
                min={5}
                max={500}
                step={5}
                value={maxDistance}
                onChange={(e) => setMaxDistance(e.target.value)}
                style={{ width: '100%', accentColor: GOLD }}
              />
            </section>

            <button style={styles.saveBtn} onClick={saveProfile} disabled={saving}>
              {saving ? 'SAVING...' : 'SAVE CHANGES'}
            </button>
            {status && <p style={styles.status}>{status}</p>}

            {/* ---- Account ---- */}
            <section style={styles.card}>
              <h2 style={styles.sectionLabel}>ACCOUNT</h2>

              <button style={styles.outlineBtn} onClick={onLoggedOut}>
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
    color: '#e6e0d4',
    fontFamily: "'Playfair Display', serif",
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
    color: '#e6e0d4',
    fontFamily: 'Cinzel, serif',
    letterSpacing: 4,
    fontWeight: 500,
    fontSize: 20,
    textAlign: 'center',
    margin: '0 0 26px',
  },
  card: {
    border: `1px solid ${GOLD_DIM}`,
    borderRadius: 8,
    padding: '18px 20px',
    marginBottom: 18,
    background: 'rgba(21,15,19,0.9)',
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
    color: '#e6e0d4',
    fontSize: 12.5,
    margin: '12px 0 6px',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    background: '#0f0a0d',
    border: '1px solid rgba(201,162,77,0.35)',
    borderRadius: 6,
    color: '#e6e0d4',
    padding: '12px 14px',
    fontSize: 14,
    fontFamily: 'system-ui, sans-serif',
    outline: 'none',
  },
  saveBtn: {
    width: '100%',
    background: 'linear-gradient(135deg, #e8c37a, #a97f2e)',
    color: INK,
    border: 'none',
    borderRadius: 3,
    padding: '12px 0',
    fontFamily: 'Cinzel, serif',
    fontSize: 12,
    letterSpacing: 1.5,
    cursor: 'pointer',
    marginBottom: 8,
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
    color: '#a3768f',
    fontSize: 12.5,
    cursor: 'pointer',
    marginTop: 16,
    padding: 0,
    textDecoration: 'underline',
  },
  dangerZone: {
    marginTop: 16,
    borderTop: '1px solid rgba(163,118,143,0.35)',
    paddingTop: 14,
  },
  dangerText: {
    color: '#d8cfd8',
    fontSize: 12.5,
    lineHeight: 1.6,
  },
  deleteBtn: {
    background: '#a3384f',
    color: '#f2ede2',
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
    color: '#9d8fa3',
    textAlign: 'center',
    marginTop: 60,
    fontFamily: 'Cinzel, serif',
    fontSize: 12,
    letterSpacing: 1.5,
  },
};
