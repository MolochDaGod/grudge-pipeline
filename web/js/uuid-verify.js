/**
 * Grudge UUID helpers — fleet SSOT uses deterministic ids from r2Key.
 * D1 rows expose grudgeUuid; missing ones can be derived as UUID-v5-style
 * from SHA-1("grudge-asset:" + r2Key) (see VOXEL_LAST30_D1_CODEX / asset registry).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s.trim());
}

function bytesToUuid(b) {
  // b: Uint8Array length >= 16
  const hex = [...b.slice(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Deterministic grudge asset UUID from r2 relative key. */
export async function grudgeUuidFromR2Key(r2Key) {
  const key = String(r2Key || '')
    .replace(/\\/g, '/')
    .replace(/^\//, '');
  if (!key) return null;
  const data = new TextEncoder().encode(`grudge-asset:${key}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', data));
  // UUID version 5 nibble + RFC variant
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return bytesToUuid(hash);
}

/**
 * Verify one asset entry against optional D1 index maps.
 * @param {object} m normalized model
 * @param {{ byUuid: Map, byPath: Map }} index
 * @returns {Promise<{status:string, uuid:string|null, expected:string|null, message:string}>}
 */
export async function verifyAssetUuid(m, index = { byUuid: new Map(), byPath: new Map() }) {
  const path = (m.path || '').replace(/\\/g, '/').replace(/^\//, '');
  const declared = m.grudgeUuid || null;
  let expected = null;
  if (path && !m.isBakedClip && m.format !== 'json') {
    try {
      expected = await grudgeUuidFromR2Key(path);
    } catch {
      expected = null;
    }
  }

  if (declared && !isValidUuid(declared)) {
    return {
      status: 'invalid',
      uuid: declared,
      expected,
      message: 'Declared UUID fails RFC format',
    };
  }

  const declKey = declared ? declared.toLowerCase() : null;
  const expKey = expected ? expected.toLowerCase() : null;

  if (declared && declKey && index.byUuid.has(declKey)) {
    const row = index.byUuid.get(declKey);
    const rowPath = (row.path || row.r2Key || '').replace(/\\/g, '/');
    if (path && rowPath && rowPath !== path && !rowPath.endsWith(path) && !path.endsWith(rowPath)) {
      return {
        status: 'mismatch',
        uuid: declared,
        expected: expected || declared,
        message: `UUID maps to different path: ${rowPath}`,
      };
    }
    if (expected && declKey !== expKey) {
      return {
        status: 'mismatch',
        uuid: declared,
        expected,
        message: 'Declared UUID ≠ hash(grudge-asset:r2Key)',
      };
    }
    return {
      status: 'ok',
      uuid: declared,
      expected: expected || declared,
      message: 'Present in D1 index',
    };
  }

  if (declared && isValidUuid(declared)) {
    // Valid format but not in loaded D1 slice
    if (expected && declKey === expKey) {
      return {
        status: 'ok',
        uuid: declared,
        expected,
        message: 'Matches deterministic r2Key hash',
      };
    }
    return {
      status: 'orphan',
      uuid: declared,
      expected,
      message: 'Valid UUID not found in loaded D1 pages',
    };
  }

  if (expected) {
    if (expKey && index.byUuid.has(expKey)) {
      return {
        status: 'ok',
        uuid: expected,
        expected,
        message: 'Derived UUID found in D1',
      };
    }
    return {
      status: 'derived',
      uuid: expected,
      expected,
      message: 'No D1 UUID — derived from r2Key',
    };
  }

  // Baked clips / curated arena URLs may not use r2 keys
  if (m.isBakedClip || m.source === 'arena-baked' || m.source === 'grudge6-curated') {
    return {
      status: 'n/a',
      uuid: declared,
      expected: null,
      message: 'Curated / non-R2 entry',
    };
  }

  return {
    status: 'missing',
    uuid: null,
    expected: null,
    message: 'No UUID and cannot derive',
  };
}

export async function verifyAll(models, index, onProgress) {
  const results = new Map();
  let i = 0;
  for (const m of models) {
    const r = await verifyAssetUuid(m, index);
    m.uuidStatus = r.status;
    m.grudgeUuid = m.grudgeUuid || r.uuid;
    m.uuidMessage = r.message;
    m.uuidExpected = r.expected;
    results.set(m.id, r);
    i++;
    if (onProgress && i % 25 === 0) onProgress(i, models.length);
  }
  if (onProgress) onProgress(models.length, models.length);
  return results;
}

export function uuidStatusClass(status) {
  switch (status) {
    case 'ok':
      return 'uuid-ok';
    case 'derived':
      return 'uuid-derived';
    case 'orphan':
      return 'uuid-orphan';
    case 'mismatch':
    case 'invalid':
      return 'uuid-bad';
    case 'n/a':
      return 'uuid-na';
    case 'dup':
      return 'uuid-bad';
    default:
      return 'uuid-missing';
  }
}

/**
 * Find catalog duplicates by UUID and basename for purge UI.
 * @param {object[]} models
 * @returns {{ byUuid: object[], byBasename: object[], summary: object }}
 */
export function findCatalogDuplicates(models) {
  const byUuid = new Map();
  const byBase = new Map();
  for (const m of models || []) {
    const path = String(m.path || m.r2Key || m.id || '')
      .replace(/\\/g, '/')
      .replace(/^\//, '');
    const base = path.split('/').pop() || m.name || '';
    const uuid = (m.grudgeUuid || '').toLowerCase();
    if (uuid && isValidUuid(uuid)) {
      if (!byUuid.has(uuid)) byUuid.set(uuid, []);
      byUuid.get(uuid).push(m);
    }
    if (base) {
      const k = base.toLowerCase();
      if (!byBase.has(k)) byBase.set(k, []);
      byBase.get(k).push(m);
    }
  }

  function groups(map, reason) {
    const out = [];
    for (const [key, list] of map) {
      const paths = new Set(
        list.map((m) => String(m.path || m.r2Key || m.id || '').replace(/\\/g, '/')),
      );
      if (paths.size < 2) continue;
      out.push({
        reason,
        key,
        count: paths.size,
        paths: [...paths],
        names: list.map((m) => m.name).filter(Boolean),
      });
    }
    return out.sort((a, b) => b.count - a.count);
  }

  const gU = groups(byUuid, 'uuid');
  const gB = groups(byBase, 'basename');
  return {
    byUuid: gU,
    byBasename: gB,
    summary: {
      models: models.length,
      uuidDupGroups: gU.length,
      basenameDupGroups: gB.length,
      purgeHints: gU.length + gB.length,
    },
  };
}

/** Deploy AI worker base (override via window.GRUDGE_ASSET_DEPLOY_AI). */
export function deployAiBase() {
  if (typeof window !== 'undefined' && window.GRUDGE_ASSET_DEPLOY_AI) {
    return String(window.GRUDGE_ASSET_DEPLOY_AI).replace(/\/$/, '');
  }
  // workers.dev is always live; custom host needs DNS orange-cloud
  return 'https://grudge-asset-deploy-ai.grudge.workers.dev';
}

export async function callDeployAi(path, body) {
  const base = deployAiBase();
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `deploy-ai ${r.status}`);
  return j;
}
