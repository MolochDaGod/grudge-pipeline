/**
 * World SI scale SSOT — 1 unit = 1 metre. Race heights are character truth.
 *
 * Do NOT force every hero to 1.8 m. Use RACE_HEIGHT_M (orc = 2.0, human = 1.8, …),
 * unit-snap cm↔m against that race, leave scale alone when already true.
 * Weapons / buildings / islands report metres relative to those humans.
 *
 * Classic failures:
 *  - ~100× (cm as m)
 *  - Category-blind "fit everything to 1.8 m" (arrows, boats, ORCS)
 *
 * @see grudge-character-correctness · grudge-world-scale
 */

/**
 * SI race heights are the character yardstick — not "force everything to 1.8".
 * Orc = 2.0 m. Human (WK) = 1.8 m. Unit decade (cm↔m) is diagnosed against
 * the race you are loading. Other assets are sized relative to these metres.
 */
export const HUMAN_HEIGHT_M = 1.8;

export const RACE_HEIGHT_M = {
  'western-kingdoms': 1.8,
  human: 1.8,
  humans: 1.8,
  barbarians: 1.95,
  barbarian: 1.95,
  'high-elves': 1.85,
  elves: 1.85,
  elf: 1.85,
  dwarves: 1.45,
  dwarf: 1.45,
  orcs: 2.0,
  orc: 2.0,
  undead: 1.8,
};

/** raceId / alias → expected standing height (m). */
export function raceHeightM(raceId) {
  if (raceId == null || raceId === '') return HUMAN_HEIGHT_M;
  if (typeof raceId === 'number' && Number.isFinite(raceId) && raceId > 0) return raceId;
  const k = String(raceId).toLowerCase().trim();
  return RACE_HEIGHT_M[k] ?? RACE_HEIGHT_M[raceId] ?? HUMAN_HEIGHT_M;
}

/** 1 Three.js unit = 1 metre (never redefine). */
export const METERS_PER_UNIT = 1;

/**
 * Decade unit snap toward a reference size.
 * 100× / 0.01× corrections land here (cm↔m, mm↔m).
 */
export function powerOfTenToward(referenceM, measuredM) {
  if (!(referenceM > 0) || !(measuredM > 0) || !Number.isFinite(referenceM) || !Number.isFinite(measuredM)) {
    return 1;
  }
  return Math.pow(10, Math.round(Math.log10(referenceM / measuredM)));
}

/**
 * Detect classic unit mistakes against an expected size.
 *
 * @param {number} measuredM  current longest/height in model units (assumed m)
 * @param {number} expectedM  category reference size in true metres
 * @returns {{
 *   unitScale: number,
 *   ratio: number,
 *   kind: 'ok'|'cm'|'mm'|'x10'|'x100'|'x1000'|'tiny'|'huge'|'unknown',
 *   detail: string,
 * }}
 */
export function diagnoseUnitScale(measuredM, expectedM) {
  if (!(measuredM > 0) || !(expectedM > 0)) {
    return {
      unitScale: 1,
      ratio: NaN,
      kind: 'unknown',
      detail: 'invalid measure',
    };
  }
  const ratio = measuredM / expectedM;

  // Within ~3× of expected — treat as author SI metres
  if (ratio >= 0.35 && ratio <= 3.0) {
    return {
      unitScale: 1,
      ratio,
      kind: 'ok',
      detail: `${measuredM.toFixed(3)} m ≈ ${ratio.toFixed(2)}× expected ${expectedM} m`,
    };
  }

  // Classic 100× oversized (cm as m: human 180 "m")
  if (ratio >= 70 && ratio <= 140) {
    return {
      unitScale: 0.01,
      ratio,
      kind: 'x100',
      detail: `~100× oversized (likely cm as m). Apply ×0.01 → ${(measuredM * 0.01).toFixed(3)} m`,
    };
  }
  // Classic 100× undersized
  if (ratio >= 1 / 140 && ratio <= 1 / 70) {
    return {
      unitScale: 100,
      ratio,
      kind: 'x100',
      detail: `~100× undersized. Apply ×100 → ${(measuredM * 100).toFixed(3)} m`,
    };
  }
  // 10×
  if (ratio >= 7 && ratio <= 14) {
    return {
      unitScale: 0.1,
      ratio,
      kind: 'x10',
      detail: `~10× oversized. Apply ×0.1 → ${(measuredM * 0.1).toFixed(3)} m`,
    };
  }
  if (ratio >= 1 / 14 && ratio <= 1 / 7) {
    return {
      unitScale: 10,
      ratio,
      kind: 'x10',
      detail: `~10× undersized. Apply ×10 → ${(measuredM * 10).toFixed(3)} m`,
    };
  }
  // 1000× (mm as m)
  if (ratio >= 700 && ratio <= 1400) {
    return {
      unitScale: 0.001,
      ratio,
      kind: 'x1000',
      detail: `~1000× oversized (mm as m?). Apply ×0.001`,
    };
  }
  // cm band without tight expected: 15–500 absolute often means cm
  if (measuredM > 15 && measuredM < 500 && expectedM < 20) {
    return {
      unitScale: 0.01,
      ratio,
      kind: 'cm',
      detail: `measure ${measuredM.toFixed(1)} looks like centimetres → ×0.01`,
    };
  }

  // Decade snap fallback
  const decade = powerOfTenToward(expectedM, measuredM);
  if (decade !== 1) {
    return {
      unitScale: decade,
      ratio,
      kind: decade > 1 ? 'tiny' : 'huge',
      detail: `decade snap ×${decade} toward ${expectedM} m (ratio ${ratio.toExponential(2)})`,
    };
  }

  return {
    unitScale: 1,
    ratio,
    kind: ratio > 3 ? 'huge' : 'tiny',
    detail: `out of band ratio=${ratio.toFixed(2)} vs expected ${expectedM} m — check author scale`,
  };
}

/**
 * Human-relative size report for the deploy panel.
 * @param {number} meters
 * @param {'height'|'longest'|'width'} [axis]
 */
export function humanRelativeLabel(meters, axis = 'height') {
  if (!(meters > 0)) return '—';
  const humans = meters / HUMAN_HEIGHT_M;
  const axisWord =
    axis === 'height' ? 'tall' : axis === 'width' ? 'wide' : 'long';
  return `${meters.toFixed(2)} m (${humans.toFixed(2)}× human ${axisWord})`;
}

/**
 * Compute uniform scale: unit fix (may be 100×) then optional category fit.
 * Unit correction is NEVER clamped to 12 — that was the "check can't fix 100×" bug.
 *
 * @param {number} measuredM
 * @param {{
 *   expectedM: number,
 *   targetM?: number|null,
 *   normalizeToTarget?: boolean,
 *   okRange?: [number, number],
 *   maxFitClamp?: number,
 *   minFitClamp?: number,
 * }} opts
 */
export function computeWorldScale(measuredM, opts) {
  const expectedM = opts.expectedM || HUMAN_HEIGHT_M;
  const diag = diagnoseUnitScale(measuredM, expectedM);
  let scale = diag.unitScale;
  let after = measuredM * scale;
  let normalized = false;
  let reasons = [diag.detail];

  if (
    opts.normalizeToTarget &&
    opts.targetM &&
    opts.okRange &&
    (after < opts.okRange[0] || after > opts.okRange[1])
  ) {
    let fit = opts.targetM / after;
    const maxF = opts.maxFitClamp ?? 12;
    const minF = opts.minFitClamp ?? 0.02;
    // Fit clamp is aesthetic only — unit decade already applied
    fit = Math.min(maxF, Math.max(minF, fit));
    scale *= fit;
    after *= fit;
    normalized = true;
    reasons.push(`fit → ${opts.targetM} m (×${fit.toFixed(3)})`);
  }

  return {
    scale,
    afterM: after,
    unitScale: diag.unitScale,
    unitKind: diag.kind,
    ratio: diag.ratio,
    normalized,
    reason: reasons.join(' · '),
    humanLabel: humanRelativeLabel(after, 'height'),
    ok: diag.kind === 'ok' || (after >= (opts.okRange?.[0] ?? 0) && after <= (opts.okRange?.[1] ?? Infinity)),
  };
}

/**
 * Reference sizes (metres) for world classes — relative to 1.8 m human.
 * expectedM = typical measure for unit diagnosis (height or longest).
 */
export const WORLD_REFERENCE_M = {
  character: { expectedM: HUMAN_HEIGHT_M, axis: 'height', humans: 1 },
  creature_small: { expectedM: 0.5, axis: 'height', humans: 0.28 },
  creature: { expectedM: 1.5, axis: 'height', humans: 0.85 },
  creature_large: { expectedM: 3.5, axis: 'height', humans: 1.9 },
  weapon: { expectedM: 1.0, axis: 'longest', humans: 0.55 },
  /** Generic projectile (prefer subtype-specific bands in projectileVfx.js) */
  projectile: { expectedM: 0.75, axis: 'longest', humans: 0.42 },
  projectile_arrow: { expectedM: 0.75, axis: 'longest', humans: 0.42 },
  projectile_bolt: { expectedM: 0.85, axis: 'longest', humans: 0.47 },
  projectile_bullet: { expectedM: 0.03, axis: 'longest', humans: 0.017 },
  projectile_cannonball: { expectedM: 0.28, axis: 'longest', humans: 0.16 },
  projectile_explosive: { expectedM: 0.18, axis: 'longest', humans: 0.1 },
  projectile_orb: { expectedM: 0.35, axis: 'longest', humans: 0.19 },
  prop: { expectedM: 1.0, axis: 'longest', humans: 0.55 },
  buildable: { expectedM: 3.0, axis: 'height', humans: 1.7 },
  building: { expectedM: 8.0, axis: 'height', humans: 4.4 },
  town_block: { expectedM: 40, axis: 'longest', humans: 22 },
  boat_small: { expectedM: 6, axis: 'longest', humans: 3.3 },
  boat: { expectedM: 20, axis: 'longest', humans: 11 },
  ship: { expectedM: 45, axis: 'longest', humans: 25 },
  vehicle: { expectedM: 4, axis: 'longest', humans: 2.2 },
  island: { expectedM: 200, axis: 'longest', humans: 110 },
  terrain_chunk: { expectedM: 100, axis: 'longest', humans: 55 },
  environment: { expectedM: 15, axis: 'longest', humans: 8 },
  /** Home-island harvestables — trees tall, rocks human-scale, debris small */
  harvest: { expectedM: 4, axis: 'longest', humans: 2.2 },
  animation: { expectedM: HUMAN_HEIGHT_M, axis: 'height', humans: 1 },
  vfx: { expectedM: 2, axis: 'longest', humans: 1.1 },
  ui: { expectedM: 0.5, axis: 'longest', humans: 0.28 },
  other: { expectedM: 2, axis: 'longest', humans: 1.1 },
};

/**
 * Realistic ok/warn bands in metres (author SI after unit fix).
 * Buildings/boats/islands are multi-human — never force to 1.8.
 */
export const WORLD_SIZE_BANDS = {
  character: { ok: [1.55, 2.05], warn: [1.4, 2.4] },
  creature: { ok: [0.2, 5], warn: [0.08, 12] },
  weapon: { ok: [0.25, 2.8], warn: [0.1, 4] },
  projectile: { ok: [0.2, 1.2], warn: [0.08, 2] },
  projectile_arrow: { ok: [0.45, 1.0], warn: [0.25, 1.35] },
  projectile_bolt: { ok: [0.5, 1.2], warn: [0.3, 1.6] },
  projectile_bullet: { ok: [0.008, 0.08], warn: [0.004, 0.15] },
  projectile_cannonball: { ok: [0.12, 0.55], warn: [0.08, 0.9] },
  projectile_explosive: { ok: [0.08, 0.45], warn: [0.04, 0.8] },
  projectile_orb: { ok: [0.12, 0.8], warn: [0.06, 1.4] },
  prop: { ok: [0.05, 6], warn: [0.02, 12] },
  buildable: { ok: [0.5, 12], warn: [0.2, 25] },
  building: { ok: [2.5, 80], warn: [1.5, 150] },
  boat: { ok: [2, 80], warn: [1, 150] },
  vehicle: { ok: [1.5, 15], warn: [0.8, 30] },
  island: { ok: [30, 5000], warn: [10, 20000] },
  environment: { ok: [1, 500], warn: [0.5, 2000] },
  harvest: { ok: [0.15, 25], warn: [0.05, 40] },
  town: { ok: [20, 2000], warn: [8, 8000] },
  animation: { ok: [1.55, 2.05], warn: [1.4, 2.4] },
  vfx: { ok: [0.05, 12], warn: [0.01, 30] },
  ui: { ok: [0.01, 2], warn: [0.001, 5] },
  other: { ok: [0.05, 50], warn: [0.01, 200] },
};
