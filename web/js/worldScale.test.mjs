import {
  HUMAN_HEIGHT_M,
  diagnoseUnitScale,
  computeWorldScale,
  humanRelativeLabel,
  powerOfTenToward,
} from './worldScale.js';

function assert(c, m) {
  if (!c) throw new Error(m);
}

assert(HUMAN_HEIGHT_M === 1.8, 'yardstick 1.8');

// Classic 100×: character authored 180 "metres" (cm)
const d1 = diagnoseUnitScale(180, 1.8);
assert(d1.kind === 'x100' || d1.unitScale === 0.01, '180 vs 1.8 is 100×');
assert(Math.abs(d1.unitScale - 0.01) < 1e-9, 'unitScale 0.01');

// 100× tiny
const d2 = diagnoseUnitScale(0.018, 1.8);
assert(Math.abs(d2.unitScale - 100) < 1e-9, '0.018 → ×100');

// SI human ok
const d3 = diagnoseUnitScale(1.75, 1.8);
assert(d3.kind === 'ok', '1.75 m human ok');

// Building 8 m ok
const d4 = diagnoseUnitScale(8, 8);
assert(d4.kind === 'ok', 'building ok');

// computeWorldScale must apply 100× fully (not clamp to 12)
const c1 = computeWorldScale(180, {
  expectedM: 1.8,
  targetM: 1.8,
  normalizeToTarget: true,
  okRange: [1.55, 2.05],
});
assert(Math.abs(c1.unitScale - 0.01) < 1e-9, 'unit unclamped 0.01');
assert(c1.afterM > 1.5 && c1.afterM < 2.1, `after unit+fit ~1.8 got ${c1.afterM}`);

const c2 = computeWorldScale(0.018, {
  expectedM: 1.8,
  targetM: 1.8,
  normalizeToTarget: true,
  okRange: [1.55, 2.05],
});
assert(c2.unitScale === 100, 'tiny gets ×100 unit');
assert(c2.afterM > 1.5 && c2.afterM < 2.2, `tiny corrected to human ${c2.afterM}`);

// Arrow must NOT normalize to 1.8
const arrow = computeWorldScale(0.7, {
  expectedM: 0.75,
  targetM: null,
  normalizeToTarget: false,
  okRange: [0.2, 1.2],
});
assert(Math.abs(arrow.scale - 1) < 1e-9, 'arrow no force scale');
assert(arrow.afterM === 0.7, 'arrow stays 0.7');

// Building 800 cm
const b = computeWorldScale(800, {
  expectedM: 8,
  normalizeToTarget: false,
  okRange: [2.5, 80],
});
assert(b.unitScale === 0.01, 'building cm');
assert(Math.abs(b.afterM - 8) < 0.01, 'building 8 m');

assert(humanRelativeLabel(3.6, 'height').includes('2.00× human'), '2 humans tall');
assert(powerOfTenToward(1.8, 180) === 0.01, 'decade');

console.log('worldScale.test.mjs: all passed');
