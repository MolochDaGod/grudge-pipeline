---
name: grudge-character-correctness
description: >
  HARD SSOT for grudge6 / Warlords character mesh, texture, scale, facing, grounding,
  and animation packs (sword_shield, longbow, magic, …). Explains and FORBIDS the
  processes that cause hip-float, sideways heroes, yellow/wrong textures, and
  1.8 m arrows. USE WHEN: character floating, sideways, wrong facing, hip height,
  sword_shield attack looks wrong, feet off ground, T-pose, yellow kit, mesh equip,
  anim pack retarget, deploy character, "why is my character sideways", pipeline
  anim-on-character. Load AFTER grudge-studio + grudge6-modular-characters; with
  grudge6-combat-runtime for attack packs; with character-fleet-audit for fleet reds.
---

# Grudge character correctness (mesh · texture · anim · deploy)

**Purpose:** Agents must **never** invent a second deploy/anim path. One pipeline.
Anything that produces **hip-float**, **sideways facing**, **wrong scale**, or
**yellow/wrong atlas** is a **known anti-pattern** — diagnose, kill, replace with SSOT.

## Pipeline browser SSOT (grudge-pipeline.vercel.app)

| Feed | Allowed? | Role |
|------|----------|------|
| `assets.grudge-studio.com/models/grudge6/races/*_Characters.fbx\|glb` | **YES — mesh SSOT** | Anim host + race kits |
| `anims/baked/**/*.json` (arena/open) | **YES — clip only** | Bip001 rotation packs |
| `grudge-arena…/cdn/assets/characters/*` | **NO** | Secondary host — caused **100×** / stale scale |
| Raw Mixamo/FBX mannequin as body | **NO** when “Play anims on character” | Clips retarget onto R2 grudge6 host only |
| D1 / ObjectStore | Catalog only | Never override race host URL with arena characters |

**Code:** `web/js/model-browser.js` (`loadCharacterKit`, `FORBIDDEN_HOST_*`) · `web/js/characterDeploy.js` (`enforceCharacterSi`, strip `.position`+`.scale`).

## Symptoms → root cause (why we saw it)

| What you see | Actual cause | Wrong process that caused it |
|--------------|--------------|------------------------------|
| **Floating at hip level** | Feet never grounded from **skinned body min.y**; or **`.position` tracks** on hips/root after idle/attack play | Ground using `pelvis.y≈0` as feet; ground once on T-pose then play full FBX position tracks; measure bbox before `skeleton.update()` |
| **Turned sideways** (sword_shield attack / idle) | Toon RTS **FBX art faces +X**; world/controller expect **local +Z** | `facePlusZ: false` or yaw=0 on grudge6 FBX; double-yaw (π + π/2); mixing modelYaw with root yaw |
| **~100× giant / tiny** | World AABB used as local scale; cm vs m | Scale without unit decade snap; scale Avatar.root instead of model |
| **Yellow / grey sludge kit** | Missing atlas or 1×1 placeholder map | FBX load without race atlas rebind; convert without texture path |
| **T-pose / wrong attack** | Wrong pack or Mixamo tracks on Bip001 | `mixamorig` rematch on grudge6; wrong pack folder; position+rotation retarget fail |
| **Arrow is 1.8 m** | Character height fit applied to projectile | Category-blind `TARGET_H = 1.8` on every mesh |

### sword_shield / “Sword and Shield Attack” specifically

1. Clip is **Bip001** pack under `anims/baked/sword_shield/…` or FBX pack — **not** Mixamo.
2. Preview host must be **grudge6 race kit** (FBX/GLB), equip mesh_ids, **atlas bound**.
3. Deploy kit with **art-forward +Z** (`rotation.y = π/2` for FBX-atlas).
4. **Strip `.position` tracks** when binding pack clips to kit (unless true root-motion game).
5. Play attack one-shot → **re-ground feet** after first sample (and after equip).

If any step is skipped, hip-float + sideways reappear — this is the “we’ve had this before” bug.

---

## KILL list (forbidden agent/code processes)

**DO NOT:**

1. ❌ Set `facePlusZ: false` (or yaw 0) on grudge6 / Toon RTS **FBX** race kits  
2. ❌ Ground characters with **pelvis world Y = 0** (that is hip height, not feet)  
3. ❌ Play animation pack clips **with hip/root `.position` tracks** on a grounded kit without re-ground  
4. ❌ Call `fitCharacterHeight` / “normalize to 1.8 m” on **weapons, arrows, props**  
5. ❌ Equip by **swapping whole body GLBs** instead of **mesh_ids visibility**  
6. ❌ Bind race atlas with wrong **flipY / colorSpace** (scrambled colors)  
7. ❌ Retarget as **mixamorig\*** when bones are **Bip001**  
8. ❌ Invent a second deploy helper that “just works in this file” — extend SSOT only  
9. ❌ Dispose AnimationDirector before next pack finishes loading  
10. ❌ Mark “done” without running the confirmation gates below  

---

## CORRECT process (mandatory order)

```
1. Load race KIT (FBX SSOT or approved GLB) — grudge6-modular-characters
2. unifySkeletons (multi-skeleton kits)
3. fitCharacterHeight(~1.8 m) — skinned body only, unit snap + clamps
4. Materials: race atlas rebind (sRGB, flipY=false for FBX atlas path) OR restore GLB maps
5. Equip: hide equippable → show mesh_ids (fuzzy name match)
6. reGroundAfterEquip (bbox changed)
7. applyArtForwardPlusZ(π/2) for fbx-atlas / grudge6 FBX  [idempotent]
8. centerXZOnPelvis (Bip001 Pelvis) — NOT full prop bbox
9. groundFeetLocal(groundY=0) from bodyBox.min.y
10. Load anim pack (sword_shield | longbow | magic | …)
    - same-origin /anims/baked preferred
    - stripPositionTracks (rotation-only) when retargeting to grounded kit
    - rematch bone names (Bip001 spaces/underscores)
11. AnimationDirector: idle gait; attack = requestOneShot
12. Sample idle/attack once → reGroundAfterAnimSample
13. validate / diagnoseCharacterLook — zero errors
```

### Code SSOT (do not fork)

| Layer | Path |
|-------|------|
| **Open / play deploy** | `gameopen/artifacts/animator/src/three/characterDeploy.ts` |
| **Height fit** | `…/fitCharacterHeight.ts` |
| **Pipeline viewer** | `grudge-pipeline/web/js/characterDeploy.js` |
| **Category scale (non-characters)** | `grudge-pipeline/web/js/deployChecks.js` |
| **Materials / yellow** | `grudge-pipeline/web/js/materials.js` + race atlas rules |
| **Combat packs** | skill `grudge6-combat-runtime` |
| **Equip** | skill `grudge6-modular-characters` |

### Three.js frame (never re-argue)

| Concept | Value |
|---------|--------|
| Up | **+Y** |
| Ground | **XZ plane**, feet at `y = groundY` |
| Units | **1 = 1 m** |
| Art-forward | **local +Z** when body yaw = 0 |
| grudge6 FBX export forward | often **+X** → add **+π/2** yaw once |

---

## Texture correctness

| Rule | Detail |
|------|--------|
| Race kits | One atlas per race; `MeshStandardMaterial({ map, color:0xffffff, metalness:0, roughness:~0.75 })` |
| Color space | `map.colorSpace = SRGBColorSpace` |
| FBX atlas path | `flipY = false`, `ClampToEdgeWrapping` |
| Broken maps | 1×1 PNG / empty image = convert failure — strip and rebind or re-bake |
| Weapons/arrows | Embed real atlas (`Texture_MAp_bow.png`); never character height fit |

---

## Animation pack correctness

| Pack | Use |
|------|-----|
| `sword_shield` | 1H + shield warrior attacks/idle/loco |
| `longbow` | Bow |
| `magic` | Staff |
| `2h_melee` / `rifle` / `unarmed` | As named |

- Mixer on **kit root**  
- Tracks: **Bip001** bone names after rematch  
- **Rotation-only** when kit is already grounded (default)  
- Attack = **one-shot overlay**, not permanent idle replace  

---

## Confirmation gates (required before “done”)

```
[ ] Height ∈ [1.55, 2.05] m for heroes
[ ] |feet minY| < 0.08 after idle sample
[ ] artForwardSet true for FBX kits OR proven +Z GLB
[ ] Pelvis bone found (Bip001 Pelvis)
[ ] Hand bones found if weapon pack
[ ] Atlas/maps not 1×1; no yellow sludge
[ ] Attack clip from correct pack (sword_shield for sword+shield)
[ ] No mixamorig tracks on Bip001 kit
[ ] diagnoseCharacterLook → ok
[ ] Pipeline/Open preview: not sideways, not hip-float
```

### Agent diagnosis snippet

```js
import { deployCharacterModel, stripPositionTracks, reGroundAfterAnimSample, diagnoseCharacterLook } from './characterDeploy.js';

deployCharacterModel(kit, { facePlusZ: 'auto', importPipeline: 'fbx-atlas' });
const clip = stripPositionTracks(rematchClip(kit, rawClip));
mixer.clipAction(clip).play();
mixer.update(1 / 30);
reGroundAfterAnimSample(kit);
console.log(diagnoseCharacterLook(kit));
```

---

## Sibling skills

| Skill | Role |
|-------|------|
| `grudge6-modular-characters` | Kit, mesh_ids, atlas equip |
| `grudge6-combat-runtime` | Director, packs, ranges |
| `character-fleet-audit` | Fleet red/yellow repair loop |
| `grudge-asset-convert` | Production bake flags |
| `grudge-warlords-assets` | No Meshy/capsules |

## Eval

- Pipeline: open `sword_shield` attack on WK kit → face camera, feet on grid, texture correct  
- Open play: spawn hero → same  
- Unit: `characterDeploy` / `deployChecks` tests green  

**If a PR reintroduces facePlusZ:false on grudge6 FBX or pelvis-as-feet grounding — reject it.**
