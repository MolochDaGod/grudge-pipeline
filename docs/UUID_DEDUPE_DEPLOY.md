# Grudge UUID · Dedupe purge · Asset Deploy AI

## grudgeUuid SSOT

Deterministic from R2 key (same in browser + Node + Worker):

```
sha1("grudge-asset:" + r2Key) → UUID v5-style (version nibble 5, RFC variant)
```

| Surface | Code |
|---------|------|
| Browser | `web/js/uuid-verify.js` → `grudgeUuidFromR2Key` |
| CLI | `scripts/lib/grudgeUuid.mjs` |
| Edge | `workers/asset-deploy-ai` `POST /v1/uuid/derive` |

## Assign / repair UUIDs on catalogs

```bash
cd F:\GitHub\grudge-pipeline
node scripts/uuid-assign.mjs D:\Games\Models\_codex_prod\catalog.json --write --report reports/uuid-codex.json
```

Generates matching D1 seed via worker:

```bash
curl -s -X POST https://asset-deploy.grudge-studio.com/v1/uuid/seed-sql \
  -H "content-type: application/json" \
  -d @catalog-assets-min.json
```

## Deduplication purge

```bash
# Catalog-level basename / UUID collisions
node scripts/dedupe-purge.mjs --catalog D:\Games\Models\_codex_prod\catalog.json \
  --out reports/dedupe-codex.json --write-plan reports/purge-codex.json

# Local dist with content hashes (slower, exact binary dups)
node scripts/dedupe-purge.mjs --dir D:\Games\Models\_codex_prod\dist --hash \
  --out reports/dedupe-hash.json --write-plan reports/purge-hash.json
```

Plan files:

- `purge-*.json` — structured remove list (keep winner by production score)
- `purge-*.sh` — `wrangler r2 object delete …` (prefixed DRY echo)
- `purge-*.sql` — `DELETE FROM asset_registry WHERE r2_key=…`

**Never run purge shell against live R2 without review.** Prefer dry-run first.

Worker:

```bash
POST /v1/dedupe/scan   { "assets": [ { "r2Key", "grudgeUuid?", "format?" } ] }
POST /v1/dedupe/purge  { "remove": ["models/..."], "dryRun": true }
# live delete requires ADMIN_TOKEN secret + dryRun:false
```

## Production deploy plan

```bash
POST /v1/deploy/plan { "assets": [...] }
```

Returns `ready` vs `blocked`. Policy: **GLB + textured/glb2glb + R2** only.

## Asset Deploy AI Worker

```bash
cd workers/asset-deploy-ai
npx wrangler deploy
# optional:
npx wrangler secret put ADMIN_TOKEN
```

| Route | Purpose |
|-------|---------|
| `GET /health` | Liveness |
| `POST /v1/uuid/*` | Derive / verify / seed SQL |
| `POST /v1/dedupe/*` | Scan / purge |
| `POST /v1/deploy/plan` | Production filter |
| `POST /v1/ai/chat` | Workers AI deploy advisor |

Custom host (if DNS ready): `asset-deploy.grudge-studio.com`.

## Pipeline browser

- Default filter: **Deploy bake → ready** + **format glb**
- **Verify UUIDs** — existing button
- **Dedupe scan** — finds basename/UUID collisions in loaded catalog
- Multipack: equip slot + mesh color/texture bind

## npm scripts (root package.json)

```json
"uuid:assign": "node scripts/uuid-assign.mjs",
"dedupe": "node scripts/dedupe-purge.mjs",
"deploy:ai-worker": "npm run deploy --prefix workers/asset-deploy-ai"
```
