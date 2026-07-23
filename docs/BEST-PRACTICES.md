# Grudge Studio — Asset Best Practices

**North star:** **textured · meshed · SI-scaled · converted · glb2glb · baked deploy assets.**

See also: `PRODUCTION_BAKE.md` · `CHARACTER_CORRECTNESS.md` · skill `grudge-asset-convert`.

---

## File format standards

### 3D models (deployment)

| Role | Format | Notes |
|------|--------|--------|
| **Production deploy** | **GLB** | Single file, web-optimized, Draco optional |
| Author / convert source | FBX, OBJ, DAE, GLTF | Convert before fleet load |
| Do not ship as primary | `.blend`, `.max`, `.ma`, raw Mixamo packs | Source only |

### Naming

- Lowercase, hyphen-separated where practical: `iron-sword.glb`
- Race kits: `WK_Characters.glb`, `BRB_Characters.glb` (prefix retained)
- No spaces in CDN keys when possible

### Textures

- Max **1024×1024** for web (`--texture-size 1024` / optimize pass)
- Prefer **WebP** or PNG; sRGB for albedo
- Race kits: one atlas per race on R2; rebind if convert drops maps
- Power-of-two when possible

### Scale (SI)

- **1 Three.js unit = 1 metre**
- Average human **1.8 m** (band 1.55–2.05 for heroes)
- Bake scale in **glb2glb** when possible — do not rely on runtime 100× forever
- Never fit weapons/arrows/buildings to 1.8 m (category scale)

---

## Production pipeline (order)

```
1. Author FBX/OBJ (Toon RTS / Mixamo / props)
2. Convert → raw GLB          (fbx2gltf / pipeline convert.mjs)
3. Production bake glb2glb    (height, texture, mesh, colliders, manifest)
4. Optimize / pack (optional) (Draco, weld, texture resize)
5. Deploy R2 + registry       (assets.grudge-studio.com)
6. Smoke in pipeline browser  (PROD badge, SI height, textures)
```

### grudge-convert (preferred for characters)

```bash
npm run convert -- fbx2gltf in.fbx -o out.raw.glb --cm-to-m --texture atlas.webp
npm run convert -- glb2glb out.raw.glb -o out.glb --height 1.8 --texture-size 1024
```

### This repo batch

| Stage | Module | Output |
|-------|--------|--------|
| Convert | `pipeline/convert.mjs` | `_converted/**/*.glb` |
| Optimize | `pipeline/optimize.mjs` | `_optimized/**/*.glb` |
| Validate | `pipeline/validate.mjs` | stats |
| Sync | `sync/to-r2.mjs` | CDN |

---

## grudge6 / RTS_TOON characters

| Concern | Practice |
|---------|----------|
| Mesh deploy | R2 **production GLB** first |
| Author | R2 FBX until GLB visually matches |
| Equip | Child mesh visibility (`mesh_ids`), not body swap |
| Skeleton | **Bip001** + hand containers |
| Anims | **Baked JSON** `anims/baked/{pack}/…` on race host |
| Forbidden host | `grudge-arena…/cdn/assets/characters/*` |
| Runtime gate | `enforceCharacterSi` ~1.8 m |

---

## Animations

| Prefer | Avoid |
|--------|--------|
| Baked Bip001 **JSON** | Playing Mixamo mannequin as body |
| Rotation-only on grounded kit | Hip `.position` / `.scale` tracks (100× / float) |
| Pack folders: sword_shield, longbow, magic | Random unbaked FBX as “SSOT” |

---

## Avatar / equipment bones

| Container | Usage |
|-----------|--------|
| `R_hand_container` | Main weapon, projectile origin |
| `L_hand_container` | Off-hand / bow |
| `L_shield_container` | Shield |
| `Bone_bag` / quiver | Utility |

---

## R2 CDN

```
assets.grudge-studio.com/models/grudge6/races/{PREFIX}_Characters.glb
assets.grudge-studio.com/textures/grudge6/...
assets.grudge-studio.com/models/{category}/{name}.glb
```

Register in D1 / ObjectStore `models3d.json` with format, textures, compression, uuid.

---

## Pipeline browser (agents)

1. Sort **Production score** (default)
2. Filter **Deploy bake → ready** for ship candidates
3. Open asset → expect **PROD GLB** or **BAKED CLIP** badge
4. Deploy panel: height ~1.8 m, textures OK, feet grounded
5. Copy import snippet uses production load comment

---

## Anti-patterns

1. Shipping raw FBX as the only CDN path for games  
2. Secondary arena character libraries as hosts  
3. Untextured / 1×1 placeholder maps  
4. 100× giants (cm as m) without unit bake or SI gate  
5. Category-blind “fit everything to 1.8 m”  
6. Embedded Mixamo mesh instead of clips on grudge6  
7. Marking done without production score / smoke  
