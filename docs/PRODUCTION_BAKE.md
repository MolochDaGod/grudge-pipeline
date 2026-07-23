# Production bake — what the pipeline wants

**Goal:** fleet assets that are **textured, meshed, SI-scaled, converted, glb2glb-optimized, and CDN-deployed**.

Raw FBX / Mixamo dumps are **author inputs**, not deployment targets.

---

## Ideal asset shape

| Property | Target |
|----------|--------|
| **Container** | **GLB** (binary glTF 2.0) |
| **Textures** | Embedded or race atlas WebP/PNG ≤ **1024** · sRGB albedo |
| **Mesh** | Production meshes (skins kept for characters; static props optimized) |
| **Scale** | **1 unit = 1 m** · humans **1.8 m** baked when possible |
| **Convert** | `fbx2gltf` / Blender → raw GLB |
| **Bake** | **`glb2glb`** (grudge-convert): scale, mesh, texture, quantize, colliders, manifest |
| **Deploy** | `assets.grudge-studio.com` R2 + D1/registry |
| **Anims** | **Baked Bip001 JSON** under `anims/baked/**` · play on grudge6 host |

---

## CLI path (ObjectStore)

```bash
cd ObjectStore
npm run convert:doctor

# Source → raw GLB
npm run convert -- fbx2gltf raw/WK_Characters.fbx -o dist/WK_Characters.raw.glb \
  --cm-to-m --texture path/to/atlas.webp

# Production bake (this is the deploy artifact)
npm run convert -- glb2glb dist/WK_Characters.raw.glb -o dist/WK_Characters.glb \
  --height 1.8 --texture-size 1024

# Ship
wrangler r2 object put grudge-assets/models/grudge6/races/WK_Characters.glb \
  --file=dist/WK_Characters.glb --content-type=model/gltf-binary
```

Local pipeline stages (this repo):

```
organized FBX/OBJ → pipeline/convert.mjs → _converted/*.glb
                  → pipeline/optimize.mjs → _optimized/*.glb (Draco + texture resize)
                  → sync to R2
```

Prefer **grudge-convert glb2glb** for character SI height + colliders; use optimize.mjs for bulk web pack.

---

## Browser policy (grudge-pipeline.vercel.app)

| Prefer | Avoid |
|--------|--------|
| R2 production **GLB** | Arena secondary character CDNs |
| **PROD GLB** / **BAKED CLIP** badges | Raw Mixamo mannequin as body |
| Sort by **Production score** | Defaulting to source FBX |
| Filter **Deploy bake → ready** | Shipping untextured / unscaled dumps |
| Clips on grudge6 R2 host | Embedded skinned anim FBX |

Code: `web/js/productionBake.js` · `model-browser.js` · `characterDeploy.js` (`enforceCharacterSi`).

---

## Agent checklist

```
[ ] Converted to GLB (not raw FBX in game loaders when avoidable)
[ ] Textures present (atlas or embedded maps)
[ ] SI scale (human ~1.8 m or category-correct metres)
[ ] glb2glb / optimize pass (texture ≤1024, mesh clean)
[ ] collider.json when character/prop needs physics
[ ] R2 path under models/… + registry
[ ] Pipeline badge PROD GLB or BAKED CLIP · score ≥ 55
[ ] Smoke: pipeline viewer height 1.55–2.05 m for heroes
```

---

## Skills

- `grudge-asset-convert` — operational CLI
- `grudge6-full-stack` — race hosts + Box3 / SI
- `grudge-character-correctness` — kill hip-float / 100×
- `grudge-d1-r2` — registry / CDN
