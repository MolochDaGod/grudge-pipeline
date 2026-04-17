# Grudge Avatar System Spec v1.0

Based on [gltf-avatar-threejs](https://github.com/shrekshao/gltf-avatar-threejs) `gl_avatar` extension.

## Overview

The Grudge Avatar System allows characters to share a single skeleton while independently swapping equipment (armor, weapons, hair, capes). It supports:

- **Switchable skins** — clothes/armor sharing a skeleton
- **Per-pixel visibility control** — bodyIdLUT texture hides character body under equipment
- **Sub-skeleton animation** — hair physics, face expressions in skin files
- **Rigid-bind nodes** — weapons attach to hand containers
- **GLB merge/export** — combine skeleton + skins into a single GLB

## File Types

### Skeleton File (Base Character)
The skeleton file contains the base rig + body mesh. One per race.

```json
{
  "extensions": {
    "gl_avatar": {
      "type": "skeleton",
      "skins": { "main": 0 },
      "nodes": {
        "head": 8,
        "R_hand_container": 15,
        "L_hand_container": 22,
        "L_shield_container": 23
      }
    }
  }
}
```

**Race skeletons**: WK_Human, BRB_Barbarian, ELF_Elf, DWF_Dwarf, ORC_Orc, UD_Undead

### Skin File (Equipment)
Each equipment piece is a separate GLB that references the skeleton.

```json
{
  "extensions": {
    "gl_avatar": {
      "type": "skin",
      "visibility": [0, 1, 1, 0, 0, ...],
      "linkedSkeletons": [{
        "inverseBindMatrices": 174,
        "name": "plate_armor",
        "skeleton": "main"
      }]
    }
  }
}
```

### Visibility Array
The visibility array maps to body region IDs painted into the `bodyIdLUT` texture:
- Index 0: unused (always 0)
- Index 1-5: torso regions
- Index 6-10: arm regions
- Index 11-15: leg regions
- Index 16-20: head/face regions
- `1` = visible, `0` = hidden by this equipment

## Equipment Slots

| Slot | Attachment | Method |
|------|-----------|--------|
| Helm | Head bone | Sub-skeleton or rigid-bind |
| Chest | Skeleton skin | Shared skeleton weights |
| Gloves | Skeleton skin | Shared skeleton weights |
| Boots | Skeleton skin | Shared skeleton weights |
| Belt | Skeleton skin | Shared skeleton weights |
| Cape | Spine2 bone | Sub-skeleton with physics |
| Shoulder | Shoulder bones | Rigid-bind |
| R Weapon | R_hand_container | Rigid-bind |
| L Weapon | L_hand_container | Rigid-bind |
| Shield | L_shield_container | Rigid-bind |

## Pipeline Processing

The avatar pipeline stage (`pipeline/avatar.mjs`) analyzes each character GLB:

1. **Skeleton detection** — checks for Mixamo 65-joint bone names
2. **Equipment detection** — identifies meshes by race prefix (WK_, BRB_, etc.) and slot names
3. **Bone container detection** — verifies R_hand_container, L_hand_container, L_shield_container exist
4. **Registry generation** — writes `avatar-registry.json` with skeleton/skin classifications

## Three.js Loading

```javascript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Load skeleton
const skeleton = await loader.loadAsync('models/characters/wk-human.glb');
scene.add(skeleton.scene);

// Load equipment skin and attach to skeleton
const armor = await loader.loadAsync('models/equipment/wk-plate-chest.glb');
// Bind to skeleton's skin using gl_avatar metadata
bindSkinToSkeleton(armor, skeleton, 'main');
```

## References
- [gl_avatar spec](https://github.com/nicross/gl_avatar) — original extension proposal
- [gltf-avatar-threejs](https://github.com/shrekshao/gltf-avatar-threejs) — reference implementation
- [Grudge Character Tester](D:\Games\Models\grudgeracecharacters\playground) — existing test app
