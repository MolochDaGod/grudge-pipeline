# Grudge UUID · Dedupe · Asset Deploy AI

## grudgeUuid SSOT

Deterministic from the R2 key (same in browser, Node, and the Worker):

```
sha1("grudge-asset:" + r2Key) → UUID v5-style (version nibble 5, RFC variant)
```

| Surface | Code |
|---------|------|
| Browser | `web/js/uuid-verify.js` → `grudgeUuidFromR2Key` |
| CLI | `scripts/lib/grudgeUuid.mjs` |
| Edge | `POST /v1/uuid/derive` on Asset Deploy AI |

This is the `grudge-assets-db.asset_registry` UUID. It is not a character UUID, not an item `grudge_uuid`, and not a `HERO-` / `EQIP-` / `ITEM-` id.

## Status

| Status | Meaning |
|--------|---------|
| `ok` | Declared UUID matches the hash |
| `derived` | No declared UUID. Use the hash |
| `repaired` | Declared UUID did not match. Display and catalogs use the hash. `uuidDeclared` keeps the old value |
| `mismatch` | That UUID already belongs to a different r2 key |
| `invalid` | Not a UUID |
| `skipped` | CLI only. Row has no `r2Key`. Definition ids are not asset UUIDs |

The browser **Verify UUIDs** button repairs the displayed UUID. It does not write D1.

## Assign / repair catalogs

```bash
cd F:\GitHub\grudge-pipeline
node scripts/uuid-assign.mjs path/to/catalog.json --write --report reports/uuid-codex.json
```

Rows with no `r2Key` or `path` are skipped. The script does not invent `models/codex/<id>.glb`.

Codex meshes that exist on R2 keep `models/codex/…` and the hash of that key (`/api/uuid-index.json`, 145 meshes). Other local meshes in `/api/convert-queue.json` use `models/local/<pack>/<file>.glb` with a derived UUID until a real GLB is uploaded. Texture packs and zip archives have no asset UUID.

## Seed SQL (UPDATE only)

`POST /v1/uuid/seed-sql` returns SQL for the real table. It updates `grudge_uuid` where `r2_key` matches. It does not `INSERT`. A caller-supplied UUID that does not match the hash is ignored.

```
POST https://grudge-asset-deploy-ai.grudge.workers.dev/v1/uuid/seed-sql
Content-Type: application/json

{ "assets": [ { "r2Key": "models/companions/ale-rigged-fixed.glb" } ] }
```

Apply with the existing D1 database (batch ≤ 100 statements):

```bash
wrangler d1 execute grudge-assets-db --remote --file=reports/uuid-repair.sql
```

Database id: `3eeadd9e-832d-4d2e-bb14-8ddf75b3ac59`. Table: `asset_registry`. Columns used: `r2_key`, `grudge_uuid`, `updated_at`.

## Dedupe

```bash
node scripts/dedupe-purge.mjs --catalog D:\Games\Models\_codex_prod\catalog.json ^
  --out reports/dedupe-codex.json --write-plan reports/purge-codex.json
```

`POST /v1/dedupe/purge` with `dryRun: false` deletes R2 objects and needs the `ADMIN_TOKEN` secret. Do not run a purge plan against live R2 without reviewing the keep list.

## Asset Deploy AI

Live base (DNS for the custom host does not resolve):

`https://grudge-asset-deploy-ai.grudge.workers.dev`

Intended custom host, not in DNS: `https://asset-deploy.grudge-studio.com`.

`GET /health` returns this route list:

| Route | Purpose |
|-------|---------|
| `GET /health` | Liveness and this route list |
| `GET /v1/pipeline/scripts` | Named convert scripts (`ObjectStore` `grudge-convert`) |
| `POST /v1/uuid/derive` | `{ r2Key }` → `grudgeUuid` |
| `POST /v1/uuid/verify` | `{ assets: [{ r2Key, grudgeUuid? }] }` → ok / derived / mismatch / invalid |
| `POST /v1/uuid/seed-sql` | `{ assets: [{ r2Key }] }` → `UPDATE` SQL |
| `POST /v1/dedupe/scan` | Basename and UUID collisions |
| `POST /v1/dedupe/purge` | `{ remove, dryRun }`. Live delete needs `ADMIN_TOKEN` |
| `POST /v1/deploy/plan` | Ready vs blocked. GLB + textured bake + R2 |
| `POST /v1/deploy/execute` | Stamp D1 from R2 magic bytes |
| `POST /v1/game/verify` | CDN + UUID check for mesh ids |
| `POST /v1/ai/chat` | Workers AI deploy notes |

D1 list (this is live): `GET https://api.grudge-studio.com/assets?limit=200&offset=0`  
Shape: `{ assets, total, limit, offset }`.  
CDN: `https://assets.grudge-studio.com/{r2Key}`.

ObjectStore `GET https://objectstore.grudge-studio.com/v1/assets` returns `{ items, total }`. That is not `asset_registry`.

## Pipeline browser

- Default filter: deploy-ready GLB
- **Verify UUIDs** — hash check; hash wins on screen (`repaired` when the stored value differed)
- **Dedupe scan** — basename / UUID collisions in the loaded catalog
- Static JSON: `/api/fleet-truth.json`, `/api/uuid-index.json`, `/api/production-catalog.json`, `/api/convert-queue.json`, `/api/fleet-needs.json`

## npm scripts

```json
"uuid:assign": "node scripts/uuid-assign.mjs",
"dedupe": "node scripts/dedupe-purge.mjs",
"deploy:ai-worker": "npm run deploy --prefix workers/asset-deploy-ai"
```

Deploy the worker from `workers/asset-deploy-ai` (`npx wrangler deploy` there). Do not deploy `GrudgeBuilder/workers/cdn` or ObjectStore `workers/ai` for this API.
