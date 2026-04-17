# Grudge Studio — Asset Best Practices

## File Format Standards

### 3D Models
- **Production format**: GLB (binary glTF 2.0) — single file, web-optimized
- **Source formats accepted**: FBX, OBJ, DAE, GLTF — auto-converted by pipeline
- **Do NOT commit**: `.blend`, `.max`, `.ma` — use as source only

### Naming Conventions
- Lowercase, hyphen-separated: `iron-sword.glb`, `orc-warrior.glb`
- No spaces in filenames — replace with hyphens
- Category prefix for ambiguous names: `rts-missile-tower.glb`, `env-pirate-tavern.glb`
- Race prefix for character equipment: `wk-helm-plate.glb`, `elf-chest-leather.glb`

### Textures
- Max resolution: **1024×1024** for web (pipeline auto-resizes larger)
- Prefer **WebP** or **PNG** — pipeline compresses automatically
- Use power-of-two dimensions when possible (512, 1024, 2048)

## Pipeline Processing

### Optimization Steps (automatic)
1. **Weld** — merge duplicate vertices at same position
2. **Dedup** — remove duplicate textures, materials, accessors
3. **Flatten** — simplify scene hierarchy
4. **Prune** — strip unused data (empty meshes, unreferenced materials)
5. **Resample** — clean up animation keyframes
6. **Quantize** — reduce attribute precision (lossless visual quality)
7. **Draco** — GPU-decompressible mesh compression
8. **Texture resize** — cap at 1024px

### Compression Results
- Typical 60-80% size reduction from raw FBX → optimized GLB
- Draco-compressed GLBs require decoder at runtime (Three.js DRACOLoader)

## Avatar System (gl_avatar)

### Skeleton Files
- Must use Mixamo 65-joint standard skeleton
- Include `bodyIdLUT` texture for per-pixel visibility control
- Body mesh included in skeleton file

### Skin Files (Equipment)
- Share skeleton via `linkedSkeletons` reference
- Include `JOINTS_0` and `WEIGHTS_0` in gl_avatar extension
- Weapons use rigid-bind to bone containers: `R_hand_container`, `L_hand_container`, `L_shield_container`

### Bone Containers
| Container | Bone | Usage |
|-----------|------|-------|
| R_hand_container | RightHand child | Swords, axes, wands, daggers |
| L_hand_container | LeftHand child | Off-hand weapons, tomes |
| L_shield_container | LeftForeArm child | Shields |
| Head | Head bone | Helmets, hair |
| Spine2 | Spine2 bone | Capes, back weapons |

## R2 CDN Upload

### Path Convention
```
assets.grudge-studio.com/models/{category}/{name}.glb
```

### Categories
- `characters/` — race character models
- `animations/{weapon-type}/` — animation clips
- `environments/` — terrain, buildings, props
- `weapons/` — weapon models
- `effects/` — VFX planes
- `space/` — space assets
- `rts/` — RTS buildings

## ObjectStore Integration

### Registry
All processed models are registered in `api/v1/models3d.json` with:
- `name`, `format`, `path`, `category`, `sizeKB`
- `checksum` (MD5 for cache busting)
- `compressionType` (draco/none)
- `meshes`, `nodes`, `textures`, `animations`, `materials` counts
- `extensions` used (KHR_draco_mesh_compression, etc.)

### Loading in Game
```javascript
import { GrudgeSDK } from '@grudge-studio/core';
const sdk = new GrudgeSDK({ token });
const models = await sdk.r2.listAssets({ prefix: 'models/characters/' });
```
