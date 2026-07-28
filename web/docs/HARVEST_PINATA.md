# Home-island harvest + three-pinata (pipeline track)

**Live browser:** [grudge-pipeline.vercel.app](https://grudge-pipeline.vercel.app/)  
**Product:** GrudgeBuilder `Island3DEngine` · `/home-island`  
**Rule:** Every harvest mesh, tool, debris GLB, and runtime package is registered in the pipeline **fleet needs** ledger so we add what we need **along the way**.

## Why this lives in the pipeline

The pipeline already holds:

- Fleet catalog (D1 + ObjectStore + grudge6)
- Deploy checks (SI, textures, kind)
- Nature / environment packs + PBR ground zips
- Convert → optimize → R2 sync

Home-island harvest needs the **same gate**: production GLB + UUID + scale + “Use in fleet” snippet — plus pinata break rules.

## Runtime (code, not GLB)

| Package / system | Role |
|------------------|------|
| `@dgreenheck/three-pinata` | Voronoi chip / shatter (ore, rock, trees) |
| `@dimforge/rapier3d-compat` | Optional dynamic fragment bodies |
| `HarvestNodeRecognition` | Tool gates (axe / pick / knife) + range |
| `PinataHarvestBreak` | Manifold proxy + impact fracture |
| `HarvestToolActions` | R-radial tool SSOT |
| `IslandResourceLoader` | CDN harvest templates |

## Tool → node map

| Node | Tool | Pinata |
|------|------|--------|
| Tree / palm | Hatchet (`axe`) | chip + trunk shatter |
| Rock | Pickaxe | chip + shatter |
| Ore / gold | Pickaxe | denser shatter + gold loot |
| Crystal | Pickaxe | shatter + gem drops |
| Flower / hemp | Knife | no pinata |
| Logs / debris / stump | — | loot / residual meshes |

## CDN keys (Island3D SSOT)

```
models/environment/harvest_logs.glb
models/environment/harvest_rock_debris.glb
models/environment/harvest_stump.glb
```

Plus battle NatureDecor trees/rocks and stylized ore multipacks (see `IslandResourceLoader` / `natureAssetCatalog`).

## Browser usage

1. Open [grudge-pipeline.vercel.app](https://grudge-pipeline.vercel.app/)
2. Open **Fleet needs → Harvest** panel (or Kind = `harvest` / search `harvest_`)
3. Click asset → **Use in fleet** shows harvest import snippet + tool gate
4. Deploy plan should keep harvest track coverage % rising

## Adding more along the way

When you ship a new harvest mesh, tool, or ground material:

1. Drop ZIP / GLB into `attackmotion/` (or pipeline root texture zips)
2. Run convert/optimize/sync (or glb2glb bake)
3. Append a row to `web/js/harvestNeeds.js` → `HARVEST_FLEET_NEEDS`
4. Update `web/api/fleet-needs.json` `todo` / `cdnKeys`
5. Redeploy pipeline Vercel (`web/` output)

## Performance

- Pinata fragment count 8–22 (docs: 10–50 sweet spot)
- Network: damage + loot only — never serialize shard meshes
- Prefer instanced / pooled debris for mass nodes

## Related

- `docs/BEST-PRACTICES.md` — bake order
- GrudgeBuilder `client/src/island3d/harvest/PINATA_HARVEST.md`
- Skill `threejs-helpers-physics-terrain` (harvest break notes)
