# Category deploy checks + world SI scale

Fleet assets are **not** all characters. Deploy validation and preview scale
must follow **kind-specific** best practices.

**Yardstick:** `HUMAN_HEIGHT_M = 1.8` · **1 unit = 1 metre**.  
See also `web/js/worldScale.js` and skill **`grudge-world-scale`**.

## Why

Fitting every mesh to **1.8 m human height** breaks projectiles and weapons:

| Asset | Wrong | Right |
|-------|--------|--------|
| Arrow | 1.8 m tall “stick” | ~0.6–0.9 m longest edge |
| Sword | hero-height | hand-relative ~0.8–1.2 m |
| Hero | author cm dump | ~1.7–1.8 m height, feet y=0 |

## Source of truth

| File | Role |
|------|------|
| `web/js/deployChecks.js` | profiles, scale policy, checklist |
| `web/js/model-browser.js` | viewer deploy + diag UI |
| `web/js/use-contract.js` | Use panel snippets + readiness pills |
| `web/js/thumbnail-capture.js` | thumbs use same scale policy |
| `docs/THUMBS_AND_USE.md` | operator notes |

## Profiles (summary)

| Kind | Axis | OK range (m) | Force fit? | Layer |
|------|------|--------------|------------|--------|
| character | height | 1.55–2.05 | → 1.8 | Player |
| creature | height | 0.25–4.5 | no | NPC |
| weapon | longest | 0.25–2.8 | no | Item |
| **projectile** | **longest** | **0.2–1.2** | **no** | **Projectile** |
| prop | longest | 0.05–6 | no | Default |
| environment | longest | 1–500 | no | Terrain |
| animation | height (host) | 1.55–2.05 | host kit | — |
| vfx | longest | 0.05–8 | no | IgnoreRaycast |

## Checklist fields

- Category classification  
- Scale (axis + range)  
- Grounding (feet / bottom / center)  
- Skeleton / pelvis / hands (when required)  
- Textures (fail on 1×1 placeholders)  
- Physics layer hint  
- Script / runtime hints  
- grudgeUuid  

PASS = zero `fail` items.

## Convert alignment

See grudge-asset-convert `references/conventions.md`:

- Heroes: `--height 1.7 --cm-to-m`  
- **Weapons / arrows: no `--height 1.7`**  
- Embed atlases; no FBX2glTF 1×1 placeholders  

## Test

```bash
node web/js/deployChecks.test.mjs
```
