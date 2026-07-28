# Projectiles + combat VFX — game-ready best practices

**Live ledger:** [grudge-pipeline.vercel.app](https://grudge-pipeline.vercel.app/) · `api/fleet-needs.json` track `combat` · `web/js/projectileVfx.js`

**North star:** textured · SI-scaled by **subtype** · object-pooled · damage on **impact** · R2 CDN + D1 index · never character-fit to 1.8 m.

---

## Subtypes (mesh + combat contract)

| Subtype | SI longest (ok) | Gravity | Parry | Collider | Notes |
|---------|-----------------|---------|-------|----------|--------|
| **arrow** | 0.45–1.0 m | yes | yes | capsule | Bow / longbow; tip +Z after lookAt |
| **bolt** | 0.5–1.2 m | yes | yes | capsule | Crossbow / ballista shell |
| **bullet** | 0.008–0.08 m | no | yes | sphere / ray | Prefer ray + tracer past ~30 m |
| **cannonball** | 0.12–0.55 m | yes | **no** | sphere | Naval / siege rock |
| **explosive** | 0.08–0.45 m | yes | **no** | sphere | Fuse or impact; radius damage |
| **magic_orb** | 0.12–0.8 m | no | yes | sphere | Emissive; optional homing |
| **trail** | design | — | no | none | IgnoreRaycast; attach to projectile |
| **impact** | design | — | no | none | One-shot at hit; auto-despawn |

Human yardstick: **1.8 m**. Projectiles are a fraction of that — **never** run `enforceCharacterSi` / height normalize on them.

---

## Pipeline → game load (same pattern as all fleet binaries)

```
1. Author / inspect mesh (pipeline browser Kind=projectile)
2. Deploy check: subtype SI band + texture (arrows) + no 100× unit error
3. Bake production GLB (glb2glb; texture-size ≤ 1024 for web)
4. R2 key: models/… or models/vfx/… (deterministic path)
5. D1 asset_registry upsert (deterministic UUID from r2Key)
6. Game: assetUrl('/' + r2Key) + object pool + combat contract
```

**Hold** local under `client/public/<same key>` only as a **dev mirror**. Production always loads CDN.

---

## Runtime pattern (all games)

```text
fire() → take from pool → place at muzzle (R_hand / weapon bone)
      → orient lookAt(velocity) so tip = flight axis
      → each frame: integrate (optional gravity)
      → on hit: damage / explode + spawn impact VFX
      → return mesh to pool (hide + clear trails)
```

| Rule | Why |
|------|-----|
| Object pool (no per-shot `new Mesh`) | 50+ concurrent arrows / bullets |
| Damage on **impact** | Matches WarProjectileSystem; avoids hitscan feel bugs |
| CCD on solid shells | Fast bullets/bolts tunnel without it |
| Layer `Projectile` | Collision matrix vs Player / NPC / Terrain |
| Trail / impact `IgnoreRaycast` | No self-hits, no blocking raycasts |
| Parry allowlist | arrow / bullet / orb only — not grenade, bomb, nova, meteor, trap |

### GrudgeBuilder references

| System | Path |
|--------|------|
| Flaming arrows + pool | `client/src/warscene/WarProjectileSystem.ts` |
| Catapult rock | `client/src/warscene/WarCatapult.ts` |
| Naval cannonballs | `client/src/tactical-ocean/threeWorldMapManager.ts` |
| Parry families | fleet combat / `projectileParry` |

---

## VFX

| Kind | Practice |
|------|----------|
| **Trail** | Parent to projectile root; short lifetime; pool Points / mesh |
| **Impact** | Spawn at contact; one-shot clip or particles; despawn ≤ 1–2 s |
| **Telegraph** | `warning_0x` rings before AoE / explosive land |
| **Heavy GLB** | Cap size / LODs — do not ship 100MB cinematic meshes as combat hits |
| **Materials** | Additive / emissive ok; fix “yellow arrow” via atlas rebind (`materials.js` bow-arrow) |

CDN targets (upload if missing):

```
models/vfx/projectiles/*
models/vfx/impacts/*
models/vfx/warning_0*.glb
models/vfx/status-magic/*
```

---

## Anti-patterns

1. Fitting arrows/bullets/cannonballs to **1.8 m** hero height  
2. Spawning a new GLB load per shot (no pool)  
3. Applying damage at **fire** instead of **impact**  
4. Local-only `public/` meshes with `assetUrl` (CDN 404 in prod)  
5. R2 put without D1 registry / catalog key  
6. Using full multipack as one projectile entity  
7. Parrying explosives / ultimates / environment traps  
8. Shipping untextured arrow meshes (yellow placeholder)

---

## Pipeline browser checklist

1. Filter **Kind → projectile** (or search `arrow` / `cannon` / `vfx`)  
2. Open asset → Deploy panel: subtype SI band green  
3. Production score / PROD badge for GLB  
4. **Copy import snippet** — includes pool + impact + subtype contract  
5. Fleet needs panel **combat** track coverage (gaps = missing R2 keys)

---

## Related

- `docs/BEST-PRACTICES.md` — global bake / SI  
- `web/js/projectileVfx.js` — subtype SSOT + fleet needs  
- `web/js/deployChecks.js` — deploy profiles + runtime checks  
- `web/api/fleet-needs.json` — track `combat`  
- skill `grudge-warlords-assets` / `grudge-d1-r2` — CDN + registry  
