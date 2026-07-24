# Per-mesh registry (individual UUID · textured · D1 alone)

## Problem

Catalog historically listed **one row per GLB file**. Real content is often:

| Pattern | Example |
|---------|---------|
| Multipack | `grindstone.glb` → 4 named meshes |
| Material variants | `wall` / `wallstone` / `wallwindowcold` |
| Damage / fill | `roofempty` / `roofhalffilled` / `rooffullfilled` / `…broken` |
| Tier instances | `copper_axe` / `silver_axe` / `gold_axe` / `diamond_axe` |
| Surface | map texture **or** vertex-color multipack (glitch weapons) |

Games and D1 must address **each mesh unit alone**.

## Identity

| Level | Key | grudgeUuid |
|-------|-----|------------|
| Pack (GLB file) | `models/codex/{pack}/{cat}/{id}.glb` | `hash(r2Key)` |
| Mesh unit | `{r2Key}#mesh:{meshName}` | `hash(r2Key + "#mesh:" + meshName)` |

Same deterministic scheme as fleet UUID SSOT (`grudge-asset:` prefix).

## Generate

```bash
cd F:\GitHub\grudge-pipeline
# needs @gltf-transform from ObjectStore node_modules
set NODE_PATH=F:\GitHub\ObjectStore\node_modules
npm run mesh:expand
```

Outputs:

- `D:\Games\Models\_codex_prod\mesh-registry.json` — packs + mesh units + families
- `seed-d1-meshes.sql` — pack rows + mesh_unit rows for `asset_registry`
- Enriched `catalog.json` with `meshUnits[]`, `variantFamily`, `textureStatus`, `damageLevel`, `tier`

## D1

Mesh unit `r2_key` is **logical** (includes `#mesh:`) so it is UNIQUE.
`animation_packs` JSON holds:

```json
{
  "type": "mesh",
  "parentR2Key": "models/codex/.../grindstone.glb",
  "meshName": "grindstone 1",
  "equipSlot": "mesh",
  "textureStatus": "map",
  "variantFamily": "blacksmith/props/grindstone",
  "productionReady": true
}
```

Seed:

```bash
wrangler d1 execute grudge-assets-db --remote --file=D:/Games/Models/_codex_prod/seed-d1-meshes.sql
```

## Game load

```js
await GrudgeMeshRegistry.load();
const spec = GrudgeMeshRegistry.resolveLoad('blacksmith/props/grindstone::grindstone 1');
// { url, meshName, grudgeUuid, isolate: true, equipSlot, textureStatus }
const gltf = await loader.loadAsync(spec.url);
GrudgeMeshRegistry.isolateMesh(gltf.scene, spec.meshName);
```

Variants:

```js
GrudgeMeshRegistry.variantsOf('cold-biome/house/wall');
// wall, wallstone, walldoor, … damage/material family
```

## Production gate

`productionReady` = texture map **or** vertex-color materials (never bare grey).
Pipeline browser + `GrudgeProductionVerify` should prefer these units for play.

## Counts (codex 2026-07-24)

See `reports/mesh-registry-report.json` after expand.
