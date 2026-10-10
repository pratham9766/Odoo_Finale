// Seeded random numbers (mulberry32). The same seed always gives the same demo world, on any Node
// version, so a demo reset recreates the same workers, rates and badge codes. (faker's output can change
// between versions, which is why the seed does not use it.)

const URL_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export function createRng(seed) {
  let state = seed >>> 0;

  /** Float in [0, 1). */
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (list) => list[Math.floor(next() * list.length)];
  const chance = (p) => next() < p;

  return {
    next, int, pick, chance,

    /** A multiple of `step` between min and max, e.g. stepped(520, 780, 10) → 640. */
    stepped: (min, max, step) => min + step * int(0, Math.round((max - min) / step)),

    /** weighted([['daily', 0.6], ['hourly', 0.4]]) */
    weighted(pairs) {
      let roll = next() * pairs.reduce((sum, [, w]) => sum + w, 0);
      for (const [value, w] of pairs) if ((roll -= w) < 0) return value;
      return pairs.at(-1)[0];
    },

    /** Shuffled copy (Fisher–Yates). */
    shuffle(list) {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },

    /** Random URL-safe string, like the tokens the app generates (demo data only, not for production). */
    token: (length, alphabet = URL_SAFE) => Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)]).join(''),
  };
}
