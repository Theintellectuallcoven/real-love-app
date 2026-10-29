// ============================================================
// REAL LOVE — Synastry engine (Phase 2)
// Scores the five Real Love categories from real ASPECTS between two charts.
//
// • When both people have exact degrees (profiles.chart_degrees), aspects are
//   measured in degrees with orbs.
// • When either person only has signs (older/seeded profiles), whole-sign
//   aspects are used instead — the traditional sign-to-sign method.
//
// Harmonious / attracting aspects (count as "aligned"): conjunction, sextile,
// trine, opposition (polarity — opposites attract). Squares, and the
// non-aspects (semi-sextile, quincunx), count as friction. With signs only,
// this gives exactly the same result as the original element-compatibility
// scoring, so existing matches keep their scores.
// ============================================================
import { SIGNS } from './chart';

export const PLANETS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars'];

export const CATEGORY = {
  Sun: 'Core Connection',
  Moon: 'Emotional Bond',
  Mercury: 'Mental Stimulation',
  Venus: 'Romantic Chemistry',
  Mars: 'Physical Chemistry',
};

// Which planet pairs feed each category. The first pair is the "main" one
// (same planet to same planet); the rest are classic cross-chart contacts.
const CATEGORY_PAIRS = {
  Sun: [['Sun', 'Sun'], ['Sun', 'Moon'], ['Moon', 'Sun']],
  Moon: [['Moon', 'Moon'], ['Moon', 'Venus'], ['Venus', 'Moon']],
  Mercury: [['Mercury', 'Mercury'], ['Mercury', 'Sun'], ['Sun', 'Mercury']],
  Venus: [['Venus', 'Venus'], ['Venus', 'Mars'], ['Mars', 'Venus']],
  Mars: [['Mars', 'Mars'], ['Mars', 'Venus'], ['Venus', 'Mars']],
};

const ASPECTS = [
  { name: 'conjunction', verb: 'meets', angle: 0, orb: 8, good: true },
  { name: 'sextile', verb: 'sextiles', angle: 60, orb: 5, good: true },
  { name: 'square', verb: 'squares', angle: 90, orb: 6, good: false },
  { name: 'trine', verb: 'trines', angle: 120, orb: 7, good: true },
  { name: 'opposition', verb: 'opposes', angle: 180, orb: 8, good: true },
  // Minor contacts — shown so every placement gets compared, counted as friction.
  { name: 'semi-sextile', verb: 'semi-sextiles', angle: 30, orb: 2, good: false },
  { name: 'quincunx', verb: 'is quincunx', angle: 150, orb: 3, good: false },
];

// Whole-sign aspect by counting signs apart (0..6).
const SIGN_DISTANCE_ASPECT = {
  0: 'conjunction', 1: 'semi-sextile', 2: 'sextile', 3: 'square', 4: 'trine', 5: 'quincunx', 6: 'opposition',
};

const byName = Object.fromEntries(ASPECTS.map(a => [a.name, a]));

function hasDegrees(chart) {
  const d = chart && chart.chart_degrees;
  return !!d && PLANETS.every(p => typeof d[p] === 'number');
}

function signOf(chart, planet) {
  return chart ? chart[planet.toLowerCase()] : null;
}

function degreeAspect(a, b) {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  // Major aspects first, then the minor ones.
  for (const asp of ASPECTS) {
    const off = Math.abs(diff - asp.angle);
    if (off <= asp.orb) return { ...asp, exact: Number(off.toFixed(1)) };
  }
  return null;
}

function signAspect(signA, signB) {
  const i = SIGNS.indexOf(signA), j = SIGNS.indexOf(signB);
  if (i < 0 || j < 0) return null;
  let dist = Math.abs(i - j);
  if (dist > 6) dist = 12 - dist;
  const name = SIGN_DISTANCE_ASPECT[dist];
  return name ? { ...byName[name], exact: null } : null;
}

// Compare two charts. Returns { score: 0-5, breakdown: [...], mode }.
// Each breakdown row: { planet, category, userSign, matchSign, hit, aspects: [{ text, good }] }
export function computeSynastry(me, them) {
  const useDegrees = hasDegrees(me) && hasDegrees(them);
  const breakdown = PLANETS.map(planet => {
    const aspects = [];
    for (const [mine, theirs] of CATEGORY_PAIRS[planet]) {
      const asp = useDegrees
        ? degreeAspect(me.chart_degrees[mine], them.chart_degrees[theirs])
        : signAspect(signOf(me, mine), signOf(them, theirs));
      if (!asp) continue;
      aspects.push({
        good: asp.good,
        name: asp.name,
        text: `Your ${mine} ${asp.verb} their ${theirs}`
          + (useDegrees && asp.exact != null ? ` (${asp.exact}° orb)` : ` (${signOf(me, mine)} · ${signOf(them, theirs)})`),
      });
    }
    // The main same-planet contact decides; a harmonious cross contact can also
    // carry the category when the main pair has no aspect at all.
    const main = aspects.find(a => a.text.startsWith(`Your ${planet} `) && a.text.includes(` their ${planet}`));
    const hit = main ? main.good : aspects.some(a => a.good);
    // Always compare the same-planet placements, even with no exact aspect,
    // so every category on the profile shows how the two charts relate.
    if (!main) {
      aspects.unshift({
        good: false, name: 'none',
        text: `Your ${planet} (${signOf(me, planet) || '?'}) and their ${planet} (${signOf(them, planet) || '?'}) don't form a close aspect`,
      });
    }
    return {
      planet,
      category: CATEGORY[planet],
      userSign: signOf(me, planet),
      matchSign: signOf(them, planet),
      hit,
      aspects,
    };
  });
  return { score: breakdown.filter(b => b.hit).length, breakdown, mode: useDegrees ? 'degrees' : 'signs' };
}
