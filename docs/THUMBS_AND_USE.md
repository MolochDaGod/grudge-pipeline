# Pipeline thumbs + Use panel

## Yellow / untextured props (arrows, bows, craftpix shells)

**Root cause:** many weapon GLBs were converted with FBX2glTF when the atlas path
was missing. The GLB still has UVs + a material name (e.g. `bow_texture_map`) but
the embedded map is a **1×1 PNG placeholder** — reads as yellow/metal sludge in Three.

**Runtime fix (viewer + thumbs):** `web/js/materials.js` strips 1×1 maps and rebinds
known atlases from CDN, e.g.

- `models/weapons/bow/Texture_MAp_bow.png` (arrows / bows)
- material name `bow_texture_map` or path `/weapons/bow/` / `_arrow_`

**Proper fix:** re-run grudge-convert with the real atlas next to the FBX so
production GLBs embed the map (do not rely on viewer rebind in games).

## Thumbnail resolution order (cards)

1. **CDN (shared)** — HEAD in order:
   - `https://assets.grudge-studio.com/thumbs/{grudgeUuid}.jpg`
   - `…/thumbs/{grudgeUuid}.webp`
   - `…/thumbs/pipeline/{grudgeUuid}.jpg`
   - `…/thumbs/by-path/{safePath}.jpg`
2. **IndexedDB** (this browser’s prior snapshots)
3. **Live WebGL snap** (offscreen, queued)

## Upload shared thumbs to R2

After generating JPEGs locally (or exporting from the browser):

```bash
# Example: uuid-named files in ./thumbs-out/
npx wrangler r2 object put grudge-assets/thumbs/<uuid>.jpg --file ./thumbs-out/<uuid>.jpg --remote
```

Bucket / binding must match fleet `assets.grudge-studio.com` (see grudge-d1-r2 skill).

## Use panel fields

| Field | Use |
|-------|-----|
| grudgeUuid | D1 / agent id |
| r2Key | R2 relative path |
| cdnUrl | Absolute binary URL |
| anim pack | sword_shield / magic / … hint |
| meshName | Multipack isolation (child mesh) |
| Import snippet | Paste into Open / loaders |

Deep link: `https://grudge-pipeline.vercel.app/?uuid=<uuid>&path=<r2Key>&q=…`

## Multipack

Never place the whole pack. Toggle meshes → **use** sets `meshName` → copy into game placement.
