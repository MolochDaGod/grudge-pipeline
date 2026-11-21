/**
 * Bake the codex mesh catalog into web/api/uuid-index.json.
 * UUID is the existing grudgeUuid when it matches the R2 key.
 * Does not invent keys and does not upload.
 */
import fs from 'node:fs';
import path from 'node:path';
import { grudgeUuidFromR2Key, verifyPair } from './lib/grudgeUuid.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const catalogPath = 'D:/Games/Models/_codex_prod/catalog.json';
const outPath = path.join(repo, 'web', 'api', 'uuid-index.json');

const packs = new Map();
const report = { ok: 0, repaired: 0, skipped: 0 };

if (fs.existsSync(catalogPath)) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  for (const mesh of catalog.meshes || []) {
    const r2Key = String(mesh.r2Key || '').replace(/\\/g, '/').replace(/^\//, '');
    if (!r2Key || !/\.glb$/i.test(r2Key)) {
      report.skipped++;
      continue;
    }
    const check = verifyPair(r2Key, mesh.grudgeUuid || null);
    const grudgeUuid = check.expected;
    if (check.status === 'ok') report.ok++;
    else report.repaired++;
    const packId = mesh.pack || r2Key.split('/')[2] || 'codex';
    if (!packs.has(packId)) packs.set(packId, []);
    const textureStatus = mesh.textureStatus === 'map' ? 'embedded' : mesh.textureStatus || 'none';
    packs.get(packId).push({
      id: mesh.id,
      name: mesh.name || path.basename(r2Key, '.glb'),
      pack: packId,
      kind: mesh.kind || 'prop',
      r2Key,
      grudgeUuid,
      uuidState: check.status === 'ok' ? 'catalog' : 'repaired',
      textureStatus,
      cdnUrl: mesh.cdnUrl || `https://assets.grudge-studio.com/${r2Key}`,
      bytes: mesh.bytes || null,
    });
  }
}

const packList = [...packs.entries()]
  .map(([id, meshes]) => ({
    id,
    count: meshes.length,
    meshes: meshes.sort((a, b) => a.r2Key.localeCompare(b.r2Key)),
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

const doc = {
  version: 1,
  generated: new Date().toISOString(),
  rule: 'sha1("grudge-asset:" + r2Key)',
  source: catalogPath,
  report,
  meshCount: packList.reduce((n, p) => n + p.count, 0),
  packs: packList,
};
fs.writeFileSync(outPath, JSON.stringify(doc));
console.log(
  `[uuid-index] meshes=${doc.meshCount} packs=${packList.length} ok=${report.ok} repaired=${report.repaired} skipped=${report.skipped}`,
);
