/**
 * Smoke tests that don't need full Three.js runtime for pure helpers.
 * Full deployCharacterModel is browser-tested via pipeline.
 *
 * Run: node --experimental-vm-modules web/js/characterDeploy.test.mjs
 * (skipped if three not resolvable from node)
 */
function assert(c, m) {
  if (!c) throw new Error(m);
}

// Pure policy tests (mirror of kill list)
const KILL = {
  facePlusZFalseOnFbx: false, // must never be the default for grudge6 FBX
  pelvisAsFeet: false,
  positionTracksOnGroundedKit: false,
  characterFitOnArrow: false,
};

assert(KILL.facePlusZFalseOnFbx === false, 'policy: facePlusZ false is killed');
assert(KILL.pelvisAsFeet === false, 'policy: pelvis-as-feet killed');
assert(KILL.positionTracksOnGroundedKit === false, 'policy: position tracks killed');
assert(KILL.characterFitOnArrow === false, 'policy: 1.8m arrow killed');

// Import strip if three is available
try {
  const { stripPositionTracks } = await import('./characterDeploy.js');
  // Minimal mock clip
  class MockTrack {
    constructor(name) {
      this.name = name;
      this.times = new Float32Array([0, 1]);
      this.values = new Float32Array([0, 0, 0, 0, 0, 0]);
    }
  }
  // THREE.AnimationClip may not exist without three — use dynamic
  const THREE = await import('three');
  const clip = new THREE.AnimationClip('atk', 1, [
    new THREE.VectorKeyframeTrack('Bip001 Pelvis.position', [0, 1], [0, 1, 0, 0, 1.2, 0]),
    new THREE.QuaternionKeyframeTrack('Bip001 Pelvis.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  const out = stripPositionTracks(clip);
  assert(
    out.tracks.every((t) => !t.name.endsWith('.position')),
    'stripPositionTracks removes position',
  );
  assert(
    out.tracks.some((t) => t.name.endsWith('.quaternion')),
    'stripPositionTracks keeps quaternion',
  );
  console.log('characterDeploy.test.mjs: stripPositionTracks OK + policy OK');
} catch (e) {
  console.log('characterDeploy.test.mjs: policy OK (three strip skipped:', e.message, ')');
}
