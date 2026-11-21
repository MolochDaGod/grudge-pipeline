# Fleet Asset Truth — grudge-pipeline.vercel.app

**Role:** Canonical UI + merge rules for **all game-usable** assets across Grudge Studio.

Live: https://grudge-pipeline.vercel.app/  
API snapshot: `/api/fleet-truth.json` · needs: `/api/fleet-needs.json` · ship: `/api/production-catalog.json` · codex UUIDs: `/api/uuid-index.json` · local queue: `/api/convert-queue.json`

---

## What “truth” means here

Every asset shown for **game use** should be:

| Property | SSOT |
|----------|------|
| **Bytes** | R2 `grudge-assets` → `https://assets.grudge-studio.com/{r2Key}` |
| **Index row** | D1 `grudge-assets-db` / `asset_registry` via `https://api.grudge-studio.com/assets` |
| **grudgeUuid** | Deterministic `sha1("grudge-asset:" + r2Key)` (UUID-v5-style) |
| **Labels** | `kind`, `subtype`, `textureStatus`, `production`, `deploy-ready`, `game:*` |
| **Game use** | Which products load it (warlords, open, mine-loader, forge, …) |
| **Import contract** | Copy snippet with CDN URL + SI/physics layer |

**Not** player state (characters/bag) — that is Builder Railway.  
**Not** voxel world authority — that is Mine-Loader Postgres.  
Pipeline is the **asset** SSOT browser.

---

## Catalog merge order

```
1. D1 asset_registry          priority 100   GET https://api.grudge-studio.com/assets
2. production-catalog.json    priority 90    /api/production-catalog.json
3. uuid-index.json (codex)    priority 85    /api/uuid-index.json
4. grudge6-ssot               priority 80
5. baked-bip001               priority 75
6. curated                    priority 70
7. ObjectStore models3d.json  priority 40    definitions supplement, not asset_registry
8. local                      priority 10    /api/convert-queue.json (models/local, not D1)
```

`https://objectstore.grudge-studio.com/v1/assets` is a different catalog (`items`, not `assets`). Do not use it as the D1 index.

Conflict resolution: higher source priority keeps identity; richer mesh/texture stats merge in.  
Code: `web/js/fleetTruth.js` · `SOURCE_PRIORITY` · `mergeTruthEntries`.

---

## IDs (do not invent)

```
r2Key      = models/…/file.glb
cdnUrl     = https://assets.grudge-studio.com/{r2Key}
grudgeUuid = grudgeUuidFromR2Key(r2Key)   // browser: uuid-verify.js
d1.id      ≈ r2Key
```

Verify in UI: **Verify UUIDs** button.

| Status | Meaning |
|--------|---------|
| `ok` | Declared UUID matches `sha1("grudge-asset:" + r2Key)` |
| `derived` | No declared UUID — display uses the hash |
| `repaired` | Declared UUID did not match. Display uses the hash. `uuidDeclared` keeps the old value. The browser does not write D1 |
| `mismatch` | That UUID is already owned by a different r2 key |
| `invalid` | Not a UUID |
| `orphan` | Valid UUID, not in the loaded D1 pages, and no hash to compare |
| `missing` | No path and no UUID |

`node scripts/uuid-assign.mjs` skips rows with no `r2Key`. It does not invent `models/codex/<id>.glb`. Definition ids are not asset UUIDs.

Codex meshes that are already baked keep `models/codex/…` keys. Other local meshes in the convert queue use `models/local/<pack>/<file>.glb` and a derived UUID. Texture packs and zip archives get no asset UUID. `models/ingest/…/pack.glb` is not a key.

---

## Game-use tags

| Tag | Typical paths / kinds |
|-----|------------------------|
| `warlords` | grudge6, nature, harvest, weapons, VFX, airship |
| `open` | grudge6, anims, weapons, library handoffs |
| `mine-loader` | blocks/codex, buildables, voxel |
| `voxgrudge` | same Codex + nature |
| `forge` | any production GLB for edit |
| `foundry` | characters + baked anims |
| `grudox` | combat VFX / weapons |
| `pipeline` | always (this browser) |

Filter chips in the browser filter by `gameUses`.

---

## Labels (canonical)

Examples:

```
kind:character · fmt:glb · src:d1 · tex:atlas · production · deploy-ready
uuid · uuid:ok · d1 · game:warlords · game:open · skel:bip001
```

Search box matches labels, UUID, r2Key, kind, game tags.

---

## Three.js viewer (pipeline) — production rules

| Rule | Implementation |
|------|----------------|
| sRGB + ACES | `threePipeline.configureRenderer` |
| DPR ≤ 1.5 | `MAX_PIXEL_RATIO` |
| Shared Draco GLTFLoader | `getGltfLoader()` — no per-load decoder |
| Dispose maps/geo | `disposeObject3D` on clear |
| SkinnedMesh | `frustumCulled = false` |
| Magic-byte gate | `isLikelyBinaryAsset` before load |
| RAF pause | stop loop when viewer closed |

## D1 deploy

```bash
# Ship labeled production GLBs + D1 SQL
npm run ship:production:dry
npm run ship:production
# Apply SQL:
# wrangler d1 execute grudge-assets-db --remote --file=reports/production-seed.sql

# Assign UUIDs on offline catalogs (skips rows with no r2Key)
node scripts/uuid-assign.mjs path/to/catalog.json --write
```

Browser auto-loads **D1 pages** from `https://api.grudge-studio.com/assets` (200/page, capped) and merges production-catalog, uuid-index, and ObjectStore.

Asset Deploy AI (UUID derive / verify / seed SQL / deploy plan) is live at `https://grudge-asset-deploy-ai.grudge.workers.dev`. `https://asset-deploy.grudge-studio.com` is not in DNS. Route list: `docs/UUID_DEDUPE_DEPLOY.md`.

---

## Related systems

| System | Asset role |
|--------|------------|
| Open | Consumes CDN + optional D1; launches Realms |
| Mine-Loader | Blocks API separate; hero meshes from CDN |
| Warlords / client | `assetUrl(r2Key)` |
| Forge | Deep-link from pipeline Use panel |
| Foundry | Race kits + anim packs |
| ObjectStore | JSON defs, not binary SSOT |

See also: `FLEET_INTEGRATION.md`, Mine-Loader `FLEET_WIDE_INTEGRATION.md`, skill `grudge-d1-r2`.
