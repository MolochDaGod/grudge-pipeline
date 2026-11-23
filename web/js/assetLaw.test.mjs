/**
 * Asset law + Grudge UUID: CDN-only URLs, one uuid-keyed thumb, and the
 * fleet uuid = UUID v5 of sha1("grudge-asset:" + r2Key).
 * Run: node --test web/js/assetLaw.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cdnOnlyUrl } from './fleetTruth.js';
import { cdnThumbCandidates } from './use-contract.js';
import { grudgeUuidFromR2Key } from './uuid-verify.js';

test('cdnOnlyUrl keeps only https://assets.grudge-studio.com and local blob:', () => {
  assert.equal(cdnOnlyUrl('https://assets.grudge-studio.com/models/a.glb'), 'https://assets.grudge-studio.com/models/a.glb');
  assert.equal(cdnOnlyUrl('blob:https://grudge-pipeline.vercel.app/1'), 'blob:https://grudge-pipeline.vercel.app/1');
  for (const bad of [
    'https://molochdagod.github.io/ObjectStore/models/a.glb',
    'https://asset-deploy.grudge-studio.com/a.glb',
    'https://grudge-arena.grudge-studio.com/anims/baked/x.json',
    'https://open.grudge-studio.com/anims/baked/x.json',
    'http://assets.grudge-studio.com/a.glb',
    'https://assets.grudge-studio.com.evil.example/a.glb',
    '',
    null,
    'not a url',
  ]) {
    assert.equal(cdnOnlyUrl(bad), null, String(bad));
  }
});

test('thumb is one CDN URL keyed by grudgeUuid, nothing without a uuid', () => {
  const uuid = '6E23E1D2-8FF8-520F-BEF7-DBC646B29489';
  assert.deepEqual(cdnThumbCandidates({ grudgeUuid: uuid, path: 'models/x.glb' }), [
    'https://assets.grudge-studio.com/thumbs/6e23e1d2-8ff8-520f-bef7-dbc646b29489.jpg',
  ]);
  assert.deepEqual(cdnThumbCandidates({ path: 'models/x.glb' }), []);
  assert.deepEqual(cdnThumbCandidates({ grudgeUuid: 'nope' }), []);
});

test('grudgeUuidFromR2Key matches every row of production-catalog.json', async () => {
  const cat = JSON.parse(readFileSync(new URL('../api/production-catalog.json', import.meta.url), 'utf8'));
  const rows = (cat.assets || []).filter((a) => a.r2Key && a.grudgeUuid);
  assert.ok(rows.length > 0);
  for (const a of rows) {
    assert.equal(await grudgeUuidFromR2Key(a.r2Key), a.grudgeUuid.toLowerCase(), a.r2Key);
  }
});
