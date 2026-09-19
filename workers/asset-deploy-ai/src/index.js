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
 *   POST /v1/game/verify      { meshIds?: string[] }  game-ready CDN + UUID batch
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
  if (fmt === 'gltf') s += 40;
  if (fmt === 'fbx') s += 5;
  if (p.includes('/asset-packs/toon-rts-characters/glb/characters/')) s += 40;
  if (p.includes('/models/codex/')) s += 20;
  if (p.includes('/models/grudge6/variants/') || /_characters\.(glb|fbx)$/.test(p)) s -= 25;
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

const TOON_PLAY =
  /asset-packs\/toon-rts-characters\/glb\/characters\/(human|barbarian|elf|dwarf|orc|undead)\.glb$/i;

const NAMED_PIPELINES = [
  { id: 'loadRaceKit', role: 'play load Toon {race}.glb' },
  { id: 'glb2glb', role: 'production bake (SI + textures + colliders)' },
  { id: 'fbx2gltf', role: 'author FBX → raw GLB' },
  { id: 'optimize', role: 'Draco/Meshopt + WebP pack' },
  { id: 'ingest.convert', role: 'Dev Tool Blender convert FileVersion 6100' },
];

function isAuthorJunkPath(p) {
  const s = String(p || '').toLowerCase();
  return (
    /models\/grudge6\/variants\//.test(s) ||
    /models\/grudge6\/(wk|brb|ud|orc|elf|dwf)\//.test(s) ||
    /models\/grudge6\/races\/\w+_characters\.(glb|fbx)$/.test(s) ||
    /_(horse|wizard|knight|hammer_simple)\.glb$/.test(s)
  );
}

function isProductionish(a) {
  const p = String(a.r2Key || a.path || '').toLowerCase();
  const fmt = String(a.format || p.split('.').pop() || '').toLowerCase();
  if (isAuthorJunkPath(p)) return false;
  if (TOON_PLAY.test(p)) return true;
  if (fmt !== 'glb' && fmt !== 'gltf') return false;
  if (!p.startsWith('models/') && !p.startsWith('asset-packs/') && !p.startsWith('prod/gltf/')) {
    return false;
  }
  if (a.productionBaked || a.bakePipeline === 'glb2glb' || a.deployReady) return true;
  if ((a.textures || 0) > 0 || a.textureStatus === 'atlas' || a.textureStatus === 'embedded') {
    return true;
  }
  if (p.includes('/models/codex/') && (fmt === 'glb' || fmt === 'gltf')) return true;
  return false;
}

function magicKind(buf) {
  if (!buf || buf.length < 4) return 'empty';
  if (buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46) return 'glb';
  const head = new TextDecoder().decode(buf.slice(0, 16));
  if (head.includes('<!DOC') || head.includes('<html') || head.includes('<HTML')) return 'html';
  if (head.includes('Kaydara') || head.startsWith('; FBX')) return 'fbx';
  if (buf[0] === 0x7b) return 'json';
  return 'other';
}

async function probeR2(env, r2Key) {
  try {
    if (env.ASSETS) {
      const obj = await env.ASSETS.get(r2Key, { range: { offset: 0, length: 24 } });
      if (obj) {
        const buf = new Uint8Array(await obj.arrayBuffer());
        return { kind: magicKind(buf), via: 'r2', bytes: buf.length };
      }
    }
  } catch {
    /* CDN fallback */
  }
  try {
    const r = await fetch(`https://assets.grudge-studio.com/${r2Key}`, {
      headers: { Range: 'bytes=0-23' },
    });
    if (!r.ok && r.status !== 206) return { kind: r.status === 404 ? 'missing' : 'other', via: 'cdn', status: r.status };
    const buf = new Uint8Array(await r.arrayBuffer());
    return { kind: magicKind(buf), via: 'cdn', bytes: buf.length, status: r.status };
  } catch (e) {
    return { kind: 'error', via: 'cdn', error: String(e.message || e) };
  }
}

async function stampRegistry(env, r2Key, purpose, bodyStatus, layer) {
  if (!env.DB) return { ok: false, error: 'no D1' };
  try {
    const now = Date.now();
    await env.DB.prepare(
      `UPDATE asset_registry SET purpose = COALESCE(?, purpose), layer = COALESCE(?, layer), body_status = COALESCE(?, body_status), updated_at = ? WHERE r2_key = ?`,
    )
      .bind(purpose || null, layer || null, bodyStatus || null, now, r2Key)
      .run();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
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
              'GET  /v1/pipeline/scripts',
              'POST /v1/uuid/derive',
              'POST /v1/uuid/verify',
              'POST /v1/uuid/seed-sql',
              'POST /v1/dedupe/scan',
              'POST /v1/dedupe/purge',
              'POST /v1/deploy/plan',
              'POST /v1/deploy/execute',
              'POST /v1/ai/chat',
              'POST /v1/game/verify',
            ],
            slot: 'https://asset-deploy.grudge-studio.com',
            scripts: NAMED_PIPELINES,
          },
          200,
          env,
          request,
        );
      }

      if (request.method === 'GET' && url.pathname === '/v1/pipeline/scripts') {
        return json({ ok: true, scripts: NAMED_PIPELINES, convert: 'ObjectStore grudge-convert' }, 200, env, request);
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
              'Play characters = Toon RTS {race}.glb. Optimized GLB/glTF on R2. Variants/fused races bake are author.',
          },
          200,
          env,
          request,
        );
      }

      // ── Deploy execute (stamp D1 + magic-byte; not flag-only) ─
      if (url.pathname === '/v1/deploy/execute') {
        let assets = body.assets || [];
        if (!assets.length && env.DB) {
          try {
            const { results } = await env.DB.prepare(
              `SELECT r2_key, name, category, purpose, layer FROM asset_registry WHERE purpose = 'play' AND layer = 'hero' LIMIT 50`,
            ).all();
            assets = (results || []).map((r) => ({ r2Key: r.r2_key, name: r.name }));
          } catch {
            assets = [
              'human',
              'barbarian',
              'elf',
              'dwarf',
              'orc',
              'undead',
            ].map((race) => ({
              r2Key: `asset-packs/toon-rts-characters/glb/characters/${race}.glb`,
              name: race,
            }));
          }
        }
        const executed = [];
        for (const a of assets.slice(0, 200)) {
          const r2Key = normalizeR2Key(a.r2Key || a.path || '');
          if (!r2Key) continue;
          const probe = await probeR2(env, r2Key);
          const junk = isAuthorJunkPath(r2Key);
          const play = TOON_PLAY.test(r2Key);
          let purpose = null;
          let layer = null;
          let bodyStatus = null;
          if (probe.kind === 'glb' || probe.kind === 'json') bodyStatus = 'real';
          else if (probe.kind === 'html') bodyStatus = 'html_fake';
          else if (probe.kind === 'missing') bodyStatus = 'missing';
          else if (probe.kind === 'fbx') bodyStatus = 'real';
          if (play && (probe.kind === 'glb' || probe.kind === 'json')) {
            purpose = 'play';
            layer = 'hero';
          } else if (junk) {
            purpose = 'author';
            layer = /horse/.test(r2Key) ? 'creature' : 'hero';
          }
          const stamp = await stampRegistry(env, r2Key, purpose, bodyStatus, layer);
          const uuid = a.grudgeUuid || (await grudgeUuidFromR2Key(r2Key));
          executed.push({
            r2Key,
            grudgeUuid: uuid,
            probe: probe.kind,
            via: probe.via,
            purpose,
            bodyStatus,
            stamped: stamp.ok,
            stampError: stamp.error || undefined,
            production: play && bodyStatus === 'real' && !junk,
          });
        }
        return json(
          {
            ok: true,
            executedCount: executed.length,
            playOk: executed.filter((e) => e.production).length,
            executed,
            scripts: NAMED_PIPELINES,
            policy: 'Stamped D1 from R2/CDN magic bytes. Did not invent a second baker.',
          },
          200,
          env,
          request,
        );
      }

      // ── Game-ready verify (for GRUDOX / fleet boot) ─
      if (url.pathname === '/v1/game/verify') {
        const meshIds = body.meshIds || [
          'glitch-weapons/weapons/copper_axe',
          'glitch-weapons/weapons/copper_sword',
          'cold-biome/trunks/trunk1',
          'blacksmith/props/anvil',
        ];
        const results = [];
        let cdnOk = 0;
        let uuidOk = 0;
        for (const id of meshIds.slice(0, 40)) {
          const r2Key = id.startsWith('models/')
            ? id
            : `models/codex/${id.replace(/\.glb$/i, '')}.glb`;
          const grudgeUuid = await grudgeUuidFromR2Key(r2Key);
          let headOk = false;
          let status = 0;
          try {
            const head = await fetch(`https://assets.grudge-studio.com/${r2Key}`, {
              method: 'HEAD',
            });
            status = head.status;
            const ct = (head.headers.get('content-type') || '').toLowerCase();
            headOk = head.ok && !ct.includes('text/html');
          } catch {
            headOk = false;
          }
          if (headOk) cdnOk++;
          if (grudgeUuid) uuidOk++;
          results.push({
            id,
            r2Key,
            grudgeUuid,
            cdnOk: headOk,
            status,
            production: headOk && r2Key.endsWith('.glb'),
          });
        }
        return json(
          {
            ok: cdnOk === results.length,
            summary: `CDN ${cdnOk}/${results.length} · UUID derived ${uuidOk}/${results.length}`,
            results,
            policy: 'Game-ready = GLB on R2 CDN with deterministic grudgeUuid',
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

        const system = `You are Grudge Studio asset deploy AI on asset-deploy.grudge-studio.com.
Rules:
- Execute: POST /v1/deploy/execute stamps D1 from R2 magic bytes. Do not only flag.
- Play heroes: asset-packs/toon-rts-characters/glb/characters/{human|barbarian|elf|dwarf|orc|undead}.glb via loadRaceKit. Never fused *_Characters.glb or variants horse/wizard/knight/hammer.
- Delivery: optimized GLB/glTF (Draco/Meshopt) on assets.grudge-studio.com. FBX is author; load sibling .glb when present.
- Convert SSOT: ObjectStore grudge-convert (fbx2gltf, glb2glb). Named scripts: loadRaceKit, glb2glb, fbx2gltf, optimize, ingest.convert.
- grudgeUuid = sha1("grudge-asset:"+r2Key) UUID v5-style.
- Never arena secondary character CDNs. Equip = mesh_ids on the kit.
Answer with the execute endpoint or existing CLI — do not invent a second pipeline.`;

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
