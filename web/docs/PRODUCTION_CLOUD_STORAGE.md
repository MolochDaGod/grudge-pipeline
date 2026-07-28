# Production cloud storage (Cloudflare R2) — best practices

**Goal:** Every in-game binary on `grudge-assets` is already **converted**, **meshed**, **textured** (or intentionally unlit VFX), **SI-kind-labeled**, and **registry-indexed** before games load it.

Live CDN: `https://assets.grudge-studio.com/<r2Key>`  
Registry: D1 `grudge-assets-db` / `asset_registry`  
Ship tool: `node scripts/ship-production-to-r2.mjs`  
Labels: `scripts/lib/productionLabels.mjs` · inspect: `scripts/lib/glbInspect.mjs`

---

## What “best” means on R2

| Gate | Requirement |
|------|-------------|
| **Format** | **GLB** v2 for 3D (not raw FBX as primary game load) |
| **Meshed** | ≥1 mesh / primitives in glTF JSON |
| **Textured** | Embedded images/atlas **or** vertex-color **or** documented emissive VFX |
| **Sized** | Prefer ≤ **20 MB** for combat/web; cinematic 100MB+ → LOD/bake first |
| **Scaled** | SI metres; kind-correct bands (human 1.8 m, arrows 0.45–1.0 m, …) |
| **Labeled** | `kind`, `subtype`, `textureStatus`, `productionBaked`, `grudgeUuid`, `physicsLayer` |
| **Indexed** | D1 row with deterministic UUID from r2Key |
| **Verified** | CDN HEAD 200 + magic-byte / GLB inspect |

**Not allowed as deploy primary**

- Raw Mixamo / FBX-only characters  
- Untextured grey meshes for weapons/heroes (yellow arrow failure mode)  
- 100× unit dumps without bake  
- Local `public/` only with `assetUrl` (prod 404)  
- Whole multipacks as one entity without `meshName`

---

## Label schema (`grudge.production-label/v1`)

```json
{
  "schema": "grudge.production-label/v1",
  "r2Key": "models/vfx/projectiles/wod_parts.glb",
  "grudgeUuid": "…",
  "name": "wod_parts",
  "kind": "vfx",
  "subtype": "trail",
  "category": "vfx",
  "group": "projectiles",
  "format": "glb",
  "productionBaked": true,
  "bakePipeline": "staged-glb-inspect",
  "deployReady": true,
  "textureStatus": "embedded",
  "meshes": 4,
  "materials": 2,
  "textures": 1,
  "physicsLayer": "IgnoreRaycast",
  "labels": ["production", "cdn", "vfx", "trail", "embedded"],
  "cdnUrl": "https://assets.grudge-studio.com/models/vfx/projectiles/wod_parts.glb"
}
```

Stored in:

1. Ship report `reports/production-ship-latest.json`  
2. Browser `web/api/production-catalog.json`  
3. D1 `asset_registry.animation_packs` JSON metadata bag  

---

## Ship workflow (agents + humans)

```bash
cd F:\GitHub\grudge-pipeline

# Inspect + label only
node scripts/ship-production-to-r2.mjs --dry-run

# Live R2 put (CF REST + OAuth) + catalog + D1 SQL
node scripts/ship-production-to-r2.mjs

# Subset
node scripts/ship-production-to-r2.mjs --only=vfx,arrow

# Apply registry (from RTS-Grudge or any wrangler with D1 bind)
npx wrangler d1 execute grudge-assets-db --remote --file=reports/production-seed.sql
```

For **source FBX** that is not yet GLB:

```bash
cd F:\GitHub\ObjectStore
npm run convert -- fbx2gltf path/to/in.fbx -o dist/out.raw.glb --cm-to-m
npm run convert -- glb2glb dist/out.raw.glb -o dist/out.glb --texture-size 1024
# then add to MANIFEST in ship-production-to-r2.mjs and re-run
```

---

## r2Key conventions

| Content | Prefix |
|---------|--------|
| Characters | `models/grudge6/races/…` |
| Projectiles | `models/projectiles/…` or `models/weapons/bow/_arrow_*` |
| Combat VFX | `models/vfx/projectiles|impacts|status-magic|warning_*` |
| Nature / harvest | `models/nature/…` · `models/environment/harvest_*` |
| Zones | `models/airship-zone/…` |
| Audio | `audio/…` |

Key = **CDN relative path** = what `assetUrl('/'+key)` uses. Keep stable forever (deterministic UUID).

---

## Deferred until bake (do not force to CDN)

| Asset | Why |
|-------|-----|
| `airship.glb` ~156 MB | Needs glb2glb + meshopt/draco |
| `supernova_1987a.glb` ~128 MB | Cinematic — not combat web hit |
| `cptjohnwayne.fbx` / `scourgefaith.fbx` | Convert → GLB first |
| Unrebaked untextured arrows | Atlas rebind then ship |

---

## Game load rule

```ts
// Only after CDN 200 + production label
const url = assetUrl('/models/vfx/projectiles/wod_parts.glb');
// kind/subtype from catalog or path conventions — never invent paths
```

Pipeline browser: sort **Production score**, filter **Deploy bake → ready**, use combat/harvest fleet needs.

---

## Related

- `docs/PRODUCTION_BAKE.md` — convert/glb2glb  
- `docs/PROJECTILES_AND_VFX.md` — combat SI + runtime  
- `docs/BEST-PRACTICES.md` — global  
- skills: `grudge-asset-convert` → `grudge-d1-r2` → `grudge-warlords-assets`  
