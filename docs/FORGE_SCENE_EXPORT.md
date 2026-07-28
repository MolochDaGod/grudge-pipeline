# Pipeline → Forge scene export

**Pipeline:** https://grudge-pipeline.vercel.app/  
**Forge:** https://forge.grudge-studio.com/

## Goal

Save a **Forge-editable scene** that includes:

- All selected **production CDN assets** (R2 URLs)
- Ground + lights
- **Starter scripts** (spin / bob / boot)
- Asset **manifest** (uuid, r2Key, kind)

…and open it in Forge for hierarchy / scripts / physics / AI edit.

## User flow

1. Open assets in the pipeline viewer.
2. Click **+ Scene cart** (or **Scene cart** bar → **+ Current asset**).
3. Repeat until the cart has every model you want.
4. Either:
   - **Save Forge scene** → downloads `*.gfscene.json`
   - **Edit in Forge** → opens Forge + posts the pack (also downloads a backup)

5. In Forge:
   - **Edit in Forge path:** scene appears automatically (edit mode).
   - **Download path:** File → **Import** / drop the `.gfscene.json`.

## Pack format

```json
{
  "entities": [ /* Forge SceneEntity[] */ ],
  "environment": { "skyColor": "...", "pipeline": { ... } },
  "_pipelinePack": {
    "name": "pipeline-scene-N",
    "scripts": [ { "name", "language", "code" } ],
    "assets": [ { "url", "r2Key", "grudgeUuid", "kind" } ]
  }
}
```

- Core renderer uses `entities` + `environment` (same as templates).
- Scripts land in `localStorage.gameforge:pipelineScripts` for AI / script tools.
- Models use **HTTPS CDN URLs** (`assets.grudge-studio.com/...`) — no Replit paths.

## API

| Module | Role |
|--------|------|
| `web/js/forgeScenePack.js` | Build pack, cart, download, openForge |
| `web/js/fleetBridge.js` | Deep links |
| Forge `App.tsx` | `?scene=` fetch · `?asset=` single model · `postMessage` import |

## Deep links

| URL | Behavior |
|-----|----------|
| `forge…/?asset=<cdn-url>&edit=1` | Ground + one model entity |
| `forge…/?scene=<https-json>&edit=1` | Full scene from hosted JSON |
| `forge…/?awaitImport=1&from=pipeline&edit=1` | Wait for pipeline `postMessage` |

## Notes

- Cart is stored in **localStorage** (`grudge_pipeline_scene_cart`, max 48).
- Prefer **production GLBs** (textured, SI, glb2glb) — same pipeline bake bar.
- Large multi-asset packs: download is always available if popup postMessage is blocked.
