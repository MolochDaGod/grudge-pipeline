# Grudge Pipeline

**Asset Processing Hub for Grudge Studio** — Convert, optimize, avatar-rig, validate, and sync 3D assets.

## What It Does

- **Ingest** — Organize raw asset ZIPs (FBX, OBJ, GLB) into categorized folders
- **Convert** — FBX/OBJ/DAE → GLB via FBX2glTF + obj2gltf
- **Optimize** — Draco compression, texture resize, dedup, weld, quantize via gltf-transform
- **Avatar** — Detect Mixamo skeletons, classify equipment meshes, generate gl_avatar metadata
- **Validate** — Spec-check all GLBs, generate model registry + manifest
- **Sync** — Push to ObjectStore + Cloudflare R2 CDN

## Quick Start

```bash
npm install
powershell -File ingest/organize.ps1   # Extract ZIPs
npm run ingest                          # Scan assets
npm run pipeline                        # Convert → Optimize → Avatar → Validate
npm run sync:objectstore                # Copy to ObjectStore
npm run sync:r2                         # Upload to R2 CDN
```

## Pipeline Commands

| Command | Description |
|---------|-------------|
| `npm run pipeline` | Run all stages |
| `npm run pipeline:convert` | FBX/OBJ → GLB |
| `npm run pipeline:optimize` | Compress & clean |
| `npm run pipeline:avatar` | Skeleton/skin analysis |
| `npm run pipeline:validate` | Validate + generate registry |
| `npm run ingest` | Scan organized assets |
| `npm run sync:objectstore` | Sync to ObjectStore |
| `npm run sync:r2` | Upload to R2 CDN |
| `npm run sync:verify` | Verify R2 matches manifest |

## Asset Categories

| Category | Packs | Description |
|----------|-------|-------------|
| Characters & Models | 14+ | Race characters (6 factions), NPCs, creatures, animals |
| Animation Packs | 11 | Pro combat (sword+shield, longbow, magic, axe), locomotion, rifle 8-way |
| Environments & Props | 14 | Terrain, foliage, trees, taverns, castles, desert, forest |
| Weapons & Equipment | 4 | Hammers, daggers, guns, frost weapons |
| Effects & VFX | 8 | Slashes, explosions, lightning, light beams, pixel FX |
| UI & 2D Pixel | 7 | Card RPG, isometric TRPG, pixel crawlers, inventory |
| Space Assets | 5 | Spaceships, backgrounds, shooter packs |
| RTS Buildings | 5 | Missile towers, radar, research center |
| Audio | 1 | Sound effects |
| Code Engines | 2 | Annihilate combat engine, Survival engine |

## Avatar System

Based on [gltf-avatar-threejs](https://github.com/shrekshao/gltf-avatar-threejs):
- Skeleton files (base rig + body) + Skin files (equipment) sharing skeletons
- Per-pixel visibility control via bodyIdLUT texture
- Rigid-bind weapon attachment to hand/shield containers
- Sub-skeleton animations (hair, capes)

See [docs/AVATAR-SPEC.md](docs/AVATAR-SPEC.md) for full spec.

## Integration

- **ObjectStore**: [molochdagod.github.io/ObjectStore](https://molochdagod.github.io/ObjectStore)
- **R2 CDN**: `assets.grudge-studio.com/models/`
- **Registry**: `api/v1/models3d.json` (1,053+ models)
- **SDK**: `@grudge-studio/core`

## Docs

- [Best Practices](docs/BEST-PRACTICES.md)
- [Avatar Spec](docs/AVATAR-SPEC.md)
- [Pipeline Guide](docs/PIPELINE-GUIDE.md)

## License

© 2026 Grudge Studio — Racalvin The Pirate King
