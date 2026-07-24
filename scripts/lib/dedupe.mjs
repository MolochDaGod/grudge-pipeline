/**
 * Asset deduplication — group by content hash, basename, and UUID collisions.
 * Prefer production GLB (textured / glb2glb / R2 models/codex) as keep winner.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { grudgeUuidFromR2Key, normalizeR2Key } from './grudgeUuid.mjs';

export function fileSha256(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

/**
 * Score which duplicate to KEEP (higher wins).
 * @param {object} a
 */
export function keepScore(a) {
  let s = 0;
  const p = String(a.r2Key || a.path || a.id || '').toLowerCase();
  const fmt = String(a.format || path.extname(p).slice(1) || '').toLowerCase();
  if (fmt === 'glb') s += 50;
  if (fmt === 'fbx') s += 5;
  if (p.includes('/models/codex/')) s += 20;
  if (p.includes('/models/grudge6/')) s += 25;
  if (p.includes('_optimized') || p.includes('/dist/') || p.includes('/prod/')) s += 15;
  if (a.productionBaked || a.bakePipeline === 'glb2glb') s += 20;
  if ((a.textures || 0) > 0 || a.textureStatus === 'atlas' || a.textureStatus === 'embedded') s += 15;
  if (a.grudgeUuid) s += 5;
  if (a.bytes || a.sizeKB) s += Math.min(10, Math.log10((a.bytes || (a.sizeKB || 1) * 1024) + 1));
  // Prefer shorter canonical keys (no " copy", "(1)", raw.)
  if (/\scopy| \(1\)|\.raw\.|\/raw\//i.test(p)) s -= 30;
  if (/\.collider\.json$/i.test(p)) s -= 5;
  return s;
}

/**
 * @param {Array<object>} assets { id?, r2Key|path, grudgeUuid?, format?, bytes?, ... }
 * @returns {{ byUuid: object[], byBasename: object[], byContentHash: object[], summary }}
 */
export function findDuplicateGroups(assets) {
  const byUuid = new Map();
  const byBase = new Map();
  const byHash = new Map();

  for (const a of assets) {
    const r2Key = normalizeR2Key(a.r2Key || a.path || '');
    const uuid = (a.grudgeUuid || (r2Key ? grudgeUuidFromR2Key(r2Key) : null) || '').toLowerCase();
    const base = path.basename(r2Key || a.name || a.id || '').toLowerCase();
    const hash = a.contentHash || a.sha256 || null;

    if (uuid) {
      if (!byUuid.has(uuid)) byUuid.set(uuid, []);
      byUuid.get(uuid).push({ ...a, r2Key, grudgeUuid: uuid });
    }
    if (base) {
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push({ ...a, r2Key, basename: base });
    }
    if (hash) {
      if (!byHash.has(hash)) byHash.set(hash, []);
      byHash.get(hash).push({ ...a, r2Key, contentHash: hash });
    }
  }

  function toGroups(map, reason, { purgeable = true } = {}) {
    const groups = [];
    for (const [key, list] of map) {
      if (list.length < 2) continue;
      // unique by r2Key
      const uniq = [];
      const seen = new Set();
      for (const item of list) {
        const k = item.r2Key || item.id;
        if (seen.has(k)) continue;
        seen.add(k);
        uniq.push(item);
      }
      if (uniq.length < 2) continue;
      const ranked = [...uniq].sort((a, b) => keepScore(b) - keepScore(a));
      const keep = ranked[0];
      const rest = ranked.slice(1);
      // Basename across packs = name clash only (do not purge voxel axe for viking axe)
      const purge = purgeable
        ? rest.map((p) => ({
            r2Key: p.r2Key,
            grudgeUuid: p.grudgeUuid,
            score: keepScore(p),
          }))
        : [];
      groups.push({
        reason,
        key,
        keep: { r2Key: keep.r2Key, grudgeUuid: keep.grudgeUuid, score: keepScore(keep) },
        purge,
        warnOnly: !purgeable,
        others: !purgeable
          ? rest.map((p) => ({ r2Key: p.r2Key, grudgeUuid: p.grudgeUuid, score: keepScore(p) }))
          : undefined,
        count: ranked.length,
      });
    }
    return groups.sort((a, b) => b.count - a.count);
  }

  const gUuid = toGroups(byUuid, 'uuid', { purgeable: true });
  const gHash = toGroups(byHash, 'content-hash', { purgeable: true });
  const gBase = toGroups(byBase, 'basename', { purgeable: false });

  const purgeKeys = new Set();
  for (const g of [...gUuid, ...gHash]) {
    g.purge.forEach((p) => purgeKeys.add(p.r2Key));
  }

  return {
    byUuid: gUuid,
    byBasename: gBase,
    byContentHash: gHash,
    summary: {
      assets: assets.length,
      uuidDupGroups: gUuid.length,
      basenameDupGroups: gBase.length,
      contentHashDupGroups: gHash.length,
      purgeCandidateCount: purgeKeys.size,
      basenameWarnOnly: true,
    },
  };
}

/**
 * Build SQL + shell purge plan (never executes by itself).
 */
export function buildPurgePlan(dedupeResult, { dryRun = true } = {}) {
  const remove = [];
  const seen = new Set();
  // Only hard dups (uuid / content-hash). Basename is warn-only.
  for (const g of [...dedupeResult.byContentHash, ...dedupeResult.byUuid]) {
    if (g.warnOnly) continue;
    for (const p of g.purge || []) {
      if (!p.r2Key || seen.has(p.r2Key)) continue;
      seen.add(p.r2Key);
      remove.push({ ...p, reason: g.reason, keep: g.keep.r2Key });
    }
  }

  const r2Cmds = remove.map(
    (r) =>
      `${dryRun ? 'echo DRY ' : ''}npx wrangler r2 object delete grudge-assets/${r.r2Key} --remote`,
  );
  const d1Sql = remove
    .map(
      (r) =>
        `DELETE FROM asset_registry WHERE r2_key = '${r.r2Key.replace(/'/g, "''")}'; -- keep ${r.keep}`,
    )
    .join('\n');

  return {
    dryRun,
    remove,
    r2Cmds,
    d1Sql,
    generatedAt: new Date().toISOString(),
  };
}
