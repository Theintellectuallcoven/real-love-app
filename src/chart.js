// ============================================================
// REAL LOVE — Natal chart engine
// Turns birth data (date + time + location) into real planet placements,
// computed right in the browser with astronomy-engine. No API keys, no network,
// works offline. Uses the TROPICAL zodiac (ecliptic of date), which is what
// Western astrology uses for sun/moon/planet signs.
// ============================================================
import * as Astronomy from 'astronomy-engine';

export const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

// The five placements the app matches on.
export const CHART_BODIES = {
  Sun: Astronomy.Body.Sun,
  Moon: Astronomy.Body.Moon,
  Mercury: Astronomy.Body.Mercury,
  Venus: Astronomy.Body.Venus,
  Mars: Astronomy.Body.Mars,
};

// Geocentric ecliptic longitude (0–360°) of a body at a given UTC date.
function eclipticLongitude(body, date) {
  const vec = Astronomy.GeoVector(body, date, true); // aberration-corrected position
  const ecl = Astronomy.Ecliptic(vec);               // true ecliptic of date
  return ((ecl.elon % 360) + 360) % 360;
}

// Which zodiac sign a longitude falls in (each sign spans 30°).
export function signFromLongitude(lon) {
  const norm = (((lon % 360) + 360) % 360);
  return SIGNS[Math.floor(norm / 30)];
}

// Convert the local birth clock time at the birth location into a UTC Date.
// We approximate the location's UTC offset from its longitude (~15° per hour).
// This ignores legal time zones and daylight saving, but for the Sun and planets
// the sign is virtually never affected, and the Moon shifts less than ~1° — only
// meaningful right on a sign cusp. Good enough for matching; noted as a known limit.
function toUtcDate(birthDate, birthTime, longitude) {
  const [y, m, d] = (birthDate || '').split('-').map(Number);
  let hh = 12, mm = 0; // noon estimate when no birth time is provided
  if (birthTime) {
    const parts = String(birthTime).split(':').map(Number);
    hh = Number.isFinite(parts[0]) ? parts[0] : 12;
    mm = Number.isFinite(parts[1]) ? parts[1] : 0;
  }
  const offsetHours = (longitude != null && Number.isFinite(longitude)) ? Math.round(longitude / 15) : 0;
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh - offsetHours, mm));
}

// Main entry point. Returns the five signs (for the existing UI + queries) PLUS
// the exact ecliptic longitudes in `degrees`, which Phase 2 uses to score real
// synastry aspects between two people.
export function computeChart({ birthDate, birthTime, latitude, longitude }) {
  if (!birthDate) throw new Error('birthDate is required to calculate a chart');
  const date = toUtcDate(birthDate, birthTime, longitude);
  if (isNaN(date.getTime())) throw new Error('Invalid birth date/time');

  const degrees = {};
  const signs = {};
  for (const [name, body] of Object.entries(CHART_BODIES)) {
    const lon = eclipticLongitude(body, date);
    degrees[name] = Number(lon.toFixed(2));
    signs[name] = signFromLongitude(lon);
  }

  return {
    sun: signs.Sun,
    moon: signs.Moon,
    mercury: signs.Mercury,
    venus: signs.Venus,
    mars: signs.Mars,
    degrees, // { Sun: 123.45, Moon: 12.9, Mercury: ..., Venus: ..., Mars: ... }
  };
}
