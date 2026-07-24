/**
 * grudge-asset-deploy-ai — edge API for UUID SSOT, dedupe, and AI deploy planning.
 *
 * Endpoints:
 *   GET  /health
 *   POST /v1/uuid/derive      { r2Key }
 *   POST /v1/uuid/verify      { assets: [{ r2Key, grudgeUuid? }] }
 *   POST /v1/uuid/seed-sql    { assets: [{ r2Key, name?, category?, bytes? }] }
 *   POST /v1/dedupe/scan      { assets: [...] }
 *   POST /v1/dedupe/purge     { remove: string[], dryRun?: true, adminToken? }
 *   POST /v1/deploy/plan      { assets: [...] }  production bake filter advice
 *   POST /v1/ai/chat          { message, context? }  Workers AI helper
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim());
  let allow = '*';
  if (origin && allowed.some((a) => matchOrigin(a, origin))) allow = origin;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Access-Control-Max-Age': '86400',
  };
}

function matchOrigin(pattern, origin) {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    const suf = pattern.slice(1);
    try {
      const host = new URL(origin).hostname;
      return host.endsWith(suf) || host === pattern.slice(2);
    } catch {
      return false;
    }
  }
  return pattern === origin;
}

function json(data, status, env, request) {
  const origin = request.headers.get('Origin') || '';
  return new Response(JSON.stringify(data, null, 0), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin, env),
    },
  });
}

function isValidUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s.trim());
}

function normalizeR2Key(r2Key) {
  return String(r2Key || '')
    .replace(/\\/g, '/')
    .replace(/^\//, '')
    .trim();
}

async function grudgeUuidFromR2Key(r2Key) {
  const key = normalizeR2Key(r2Key);
  if (!key) return null;
  const data = new TextEncoder().encode(`grudge-asset:${key}`);
  const hashBuf = await crypto.subtle.digest('SHA-1', data);
  const hash = new Uint8Array(hashBuf);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = [...hash.slice(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function verifyPair(r2Key, declared) {
  return grudgeUuidFromR2Key(r2Key).then((expected) => {
    if (!expected) return { status: 'missing', expected: null, message: 'Empty r2Key' };
    if (!declared) {
      return { status: 'derived', expected, uuid: expected, message: 'No declared UUID' };
    }
    if (!isValidUuid(declared)) {
      return { status: 'invalid', expected, uuid: declared, message: 'Invalid format' };
    }
    if (declared.toLowerCase() !== expected.toLowerCase()) {
      return {
        status: 'mismatch',
        expected,
        uuid: declared,
        message: 'Declared ≠ hash(grudge-asset:r2Key)',
      };
    }
    return { status: 'ok', expected, uuid: declared, message: 'OK' };
  });
}

function keepScore(a) {
  let s = 0;
  const p = String(a.r2Key || a.path || '').toLowerCase();
  const fmt = String(a.format || p.split('.').pop() || '').toLowerCase();
  if (fmt === 'glb') s += 50;
  if (fmt === 'fbx') s += 5;
  if (p.includes('/models/codex/')) s += 20;
  if (p.includes('/models/grudge6/')) s += 25;
  if (a.productionBaked || a.bakePipeline === 'glb2glb') s += 20;
  if ((a.textures || 0) > 0 || a.textureStatus === 'atlas') s += 15;
  if (/\scopy| \(1\)|\.raw\.|\/raw\//i.test(p)) s -= 30;
  return s;
}

function findDuplicateGroups(assets) {
  const byUuid = new Map();
  const byBase = new Map();
  for (const a of assets) {
    const r2Key = normalizeR2Key(a.r2Key || a.path || '');
    const base = r2Key.split('/').pop() || '';
    const uuid = (a.grudgeUuid || '').toLowerCase();
    if (uuid) {
      if (!byUuid.has(uuid)) byUuid.set(uuid, []);
      byUuid.get(uuid).push({ ...a, r2Key });
    }
    if (base) {
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push({ ...a, r2Key, basename: base });
    }
  }
  function groups(map, reason) {
    const out = [];
    for (const [key, list] of map) {
      const uniq = [];
      const seen = new Set();
      for (const item of list) {
        if (!item.r2Key || seen.has(item.r2Key)) continue;
        seen.add(item.r2Key);
        uniq.push(item);
      }
      if (uniq.length < 2) continue;
      const ranked = [...uniq].sort((a, b) => keepScore(b) - keepScore(a));
      out.push({
        reason,
        key,
        keep: { r2Key: ranked[0].r2Key, score: keepScore(ranked[0]) },
        purge: ranked.slice(1).map((p) => ({ r2Key: p.r2Key, score: keepScore(p) })),
        count: ranked.length,
      });
    }
    return out;
  }
  const gU = groups(byUuid, 'uuid');
  const gB = groups(byBase, 'basename');
  const purge = new Set();
  [...gU, ...gB].forEach((g) => g.purge.forEach((p) => purge.add(p.r2Key)));
  return {
    byUuid: gU,
    byBasename: gB,
    summary: {
      assets: assets.length,
      uuidDupGroups: gU.length,
      basenameDupGroups: gB.length,
      purgeCandidateCount: purge.size,
    },
  };
}

function isProductionish(a) {
  const p = String(a.r2Key || a.path || '').toLowerCase();
  const fmt = String(a.format || p.split('.').pop() || '').toLowerCase();
  if (fmt !== 'glb') return false;
  if (!p.startsWith('models/') && !String(a.cdnUrl || '').includes('assets.grudge-studio.com')) {
    return false;
  }
  if (a.productionBaked || a.bakePipeline === 'glb2glb' || a.deployReady) return true;
  if ((a.textures || 0) > 0 || a.textureStatus === 'atlas' || a.textureStatus === 'embedded') {
    return true;
  }
  // codex production glbs assumed textured after glb2glb
  if (p.includes('/models/codex/') && fmt === 'glb') return true;
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }

    try {
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        return json(
          {
            ok: true,
            service: 'grudge-asset-deploy-ai',
            endpoints: [
              'POST /v1/uuid/derive',
              'POST /v1/uuid/verify',
              'POST /v1/uuid/seed-sql',
              'POST /v1/dedupe/scan',
              'POST /v1/dedupe/purge',
              'POST /v1/deploy/plan',
              'POST /v1/ai/chat',
            ],
          },
          200,
          env,
          request,
        );
      }

      if (request.method !== 'POST') {
        return json({ error: 'method not allowed' }, 405, env, request);
      }

      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      // ── UUID derive ─────────────────────────────────
      if (url.pathname === '/v1/uuid/derive') {
        const r2Key = normalizeR2Key(body.r2Key || body.path || '');
        const grudgeUuid = await grudgeUuidFromR2Key(r2Key);
        return json({ r2Key, grudgeUuid }, 200, env, request);
      }

      // ── UUID verify batch ───────────────────────────
      if (url.pathname === '/v1/uuid/verify') {
        const assets = body.assets || [];
        const results = [];
        for (const a of assets.slice(0, 2000)) {
          const r2Key = normalizeR2Key(a.r2Key || a.path || '');
          const v = await verifyPair(r2Key, a.grudgeUuid || a.uuid || null);
          results.push({ r2Key, ...v });
        }
        const summary = {
          total: results.length,
          ok: results.filter((r) => r.status === 'ok').length,
          derived: results.filter((r) => r.status === 'derived').length,
          mismatch: results.filter((r) => r.status === 'mismatch').length,
          invalid: results.filter((r) => r.status === 'invalid').length,
        };
        return json({ summary, results }, 200, env, request);
      }

      // ── Seed SQL for D1 asset_registry ──────────────
      if (url.pathname === '/v1/uuid/seed-sql') {
        const assets = body.assets || [];
        const lines = ['BEGIN TRANSACTION;'];
        for (const a of assets.slice(0, 5000)) {
          const r2Key = normalizeR2Key(a.r2Key || a.path || '');
          if (!r2Key) continue;
          const uuid = a.grudgeUuid || (await grudgeUuidFromR2Key(r2Key));
          const name = (a.name || r2Key.split('/').pop() || 'asset').replace(/'/g, "''");
          const cat = (a.category || a.kind || 'mesh').replace(/'/g, "''");
          const bytes = Number(a.bytes) || 0;
          const tags = (a.tags || ['production', 'codex']).join(',').replace(/'/g, "''");
          lines.push(
            `INSERT OR REPLACE INTO asset_registry (grudge_uuid, r2_key, category, name, content_type, bytes, tags, updated_at) VALUES ('${uuid}', '${r2Key.replace(/'/g, "''")}', '${cat}', '${name}', 'model/gltf-binary', ${bytes}, '${tags}', datetime('now'));`,
          );
        }
        lines.push('COMMIT;');
        return json({ sql: lines.join('\n'), count: lines.length - 2 }, 200, env, request);
      }

      // ── Dedupe scan ─────────────────────────────────
      if (url.pathname === '/v1/dedupe/scan') {
        const assets = body.assets || [];
        // fill missing uuids
        for (const a of assets) {
          a.r2Key = normalizeR2Key(a.r2Key || a.path || '');
          if (!a.grudgeUuid && a.r2Key) a.grudgeUuid = await grudgeUuidFromR2Key(a.r2Key);
        }
        const report = findDuplicateGroups(assets);
        return json(report, 200, env, request);
      }

      // ── Dedupe purge (R2 + optional D1) ─────────────
      if (url.pathname === '/v1/dedupe/purge') {
        const dryRun = body.dryRun !== false;
        const remove = body.remove || [];
        const admin =
          request.headers.get('X-Admin-Token') ||
          body.adminToken ||
          (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        const allowed = env.ADMIN_TOKEN && admin && admin === env.ADMIN_TOKEN;

        if (!dryRun && !allowed) {
          return json(
            { error: 'purge requires dryRun:true or valid ADMIN_TOKEN' },
            401,
            env,
            request,
          );
        }

        const results = [];
        for (const key of remove.slice(0, 200)) {
          const r2Key = normalizeR2Key(key);
          if (dryRun) {
            results.push({ r2Key, action: 'dry-run-delete', ok: true });
            continue;
          }
          try {
            await env.ASSETS.delete(r2Key);
            if (env.DB) {
              await env.DB.prepare('DELETE FROM asset_registry WHERE r2_key = ?')
                .bind(r2Key)
                .run();
            }
            results.push({ r2Key, action: 'deleted', ok: true });
          } catch (e) {
            results.push({ r2Key, action: 'error', ok: false, error: String(e.message || e) });
          }
        }
        return json({ dryRun, results }, 200, env, request);
      }

      // ── Deploy plan (production filter) ─────────────
      if (url.pathname === '/v1/deploy/plan') {
        const assets = body.assets || [];
        const ready = [];
        const blocked = [];
        for (const a of assets) {
          a.r2Key = normalizeR2Key(a.r2Key || a.path || '');
          if (!a.grudgeUuid && a.r2Key) a.grudgeUuid = await grudgeUuidFromR2Key(a.r2Key);
          const prod = isProductionish(a);
          const row = {
            r2Key: a.r2Key,
            grudgeUuid: a.grudgeUuid,
            production: prod,
            reason: prod
              ? 'GLB on R2 with texture/bake signals'
              : 'Not production: need glb2glb textured GLB on assets.grudge-studio.com',
          };
          if (prod) ready.push(row);
          else blocked.push(row);
        }
        return json(
          {
            readyCount: ready.length,
            blockedCount: blocked.length,
            ready: ready.slice(0, 500),
            blocked: blocked.slice(0, 500),
            policy:
              'Only fully colored/textured production GLBs after glb2glb; FBX/raw blocked from deploy plan',
          },
          200,
          env,
          request,
        );
      }

      // ── AI chat helper ──────────────────────────────
      if (url.pathname === '/v1/ai/chat') {
        const message = String(body.message || '').slice(0, 4000);
        if (!message) return json({ error: 'message required' }, 400, env, request);

        const system = `You are Grudge Studio asset deploy AI.
Rules:
- grudgeUuid is deterministic: sha1("grudge-asset:"+r2Key) as UUID v5-style.
- Production assets must be GLB after glb2glb with textures/colors, SI scale, on R2 assets.grudge-studio.com.
- Prefer models/codex/** and models/grudge6/**.
- Deduplicate by content hash and basename; keep highest production score; purge copies.
- Never recommend arena secondary character CDNs for grudge6 hosts.
- Equipment multipacks: isolate meshName + equip slot (body/arms/legs/head/weapon).
Answer concisely with actionable CLI (wrangler r2, grudge-convert glb2glb, D1 seed).`;

        if (!env.AI) {
          return json(
            {
              reply:
                'Workers AI not bound. Use: node scripts/uuid-assign.mjs catalog.json --write && node scripts/dedupe-purge.mjs --catalog catalog.json --write-plan reports/purge.json',
              offline: true,
            },
            200,
            env,
            request,
          );
        }

        try {
          const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
              { role: 'system', content: system },
              {
                role: 'user',
                content: body.context
                  ? `Context:\n${JSON.stringify(body.context).slice(0, 6000)}\n\nQuestion: ${message}`
                  : message,
              },
            ],
            max_tokens: 800,
          });
          const reply =
            result?.response ||
            result?.result?.response ||
            (typeof result === 'string' ? result : JSON.stringify(result));
          return json({ reply }, 200, env, request);
        } catch (e) {
          return json(
            {
              error: 'AI run failed',
              detail: String(e.message || e),
              fallback:
                'node scripts/dedupe-purge.mjs --catalog <catalog.json> --write-plan reports/purge.json',
            },
            502,
            env,
            request,
          );
        }
      }

      return json({ error: 'not found', path: url.pathname }, 404, env, request);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500, env, request);
    }
  },
};
