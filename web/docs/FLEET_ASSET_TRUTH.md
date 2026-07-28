# Fleet Asset Truth — grudge-pipeline.vercel.app

**Role:** Canonical UI + merge rules for **all game-usable** assets across Grudge Studio.

Live: https://grudge-pipeline.vercel.app/  
API snapshot: `/api/fleet-truth.json` · needs: `/api/fleet-needs.json` · ship: `/api/production-catalog.json`

---

## What “truth” means here

Every asset shown for **game use** should be:

| Property | SSOT |
|----------|------|
| **Bytes** | R2 `grudge-assets` → `https://assets.grudge-studio.com/{r2Key}` |
| **Index row** | D1 `grudge-assets-db` / `asset_registry` via `api.grudge-studio.com/assets` |
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
1. D1 registry pages (full scan, 200/page)
2. production-catalog.json (pipeline-shipped labeled packs)
3. Curated grudge6 race kits + baked anim clips
4. ObjectStore models3d.json (supplement)
```

Conflict resolution: higher source priority keeps identity; richer mesh/texture stats merge in.  
Code: `web/js/fleetTruth.js` · `mergeTruthEntries`.

---

## IDs (do not invent)

```
r2Key      = models/…/file.glb
cdnUrl     = https://assets.grudge-studio.com/{r2Key}
grudgeUuid = grudgeUuidFromR2Key(r2Key)   // browser: uuid-verify.js
d1.id      ≈ r2Key
```

Verify in UI: **Verify UUIDs** button · status ok | derived | mismatch | invalid.

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

## Ops

```bash
# Ship labeled production GLBs + D1 SQL
npm run ship:production:dry
npm run ship:production
# Apply SQL:
# wrangler d1 execute grudge-assets-db --remote --file=reports/production-seed.sql

# Assign UUIDs on offline catalogs
node scripts/uuid-assign.mjs path/to/catalog.json --write
```

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
