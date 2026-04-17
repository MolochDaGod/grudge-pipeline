# Grudge Pipeline Guide

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Extract new asset ZIPs into organized folders
powershell -File ingest/organize.ps1

# 3. Scan and inventory all assets
npm run ingest

# 4. Run full pipeline (convert → optimize → avatar → validate)
npm run pipeline

# 5. Sync to ObjectStore
npm run sync:objectstore

# 6. Upload to R2 CDN
npm run sync:r2
```

## Pipeline Stages

### 1. Ingest — Organize Raw Assets
Place ZIP files in `attackmotion/` and run `ingest/organize.ps1`. This extracts into:
- `_organized/01_Characters_Models/` — character FBX/GLB files
- `_organized/02_Animation_Packs/` — Mixamo animation FBXes
- `_organized/03_Environments_Props/` — terrain, buildings, props
- ... (11 categories total)

Then run `npm run ingest` to scan all files and generate `attackmotion-inventory.json`.

### 2. Convert — FBX/OBJ → GLB
```bash
npm run pipeline:convert
# or with options:
node pipeline/batch.mjs convert --category=characters --verbose
```
Uses FBX2glTF for FBX/DAE files, obj2gltf for OBJ files. Output: `_converted/{category}/`

### 3. Optimize — Compress & Clean
```bash
npm run pipeline:optimize
```
Runs: weld → dedup → flatten → prune → resample → texture resize → quantize → Draco compress. Output: `_optimized/{category}/`

### 4. Avatar — Skeleton/Skin Analysis
```bash
npm run pipeline:avatar
```
Analyzes character GLBs for Mixamo skeleton compatibility, detects equipment meshes, bone containers. Generates `_optimized/avatar-registry.json`.

### 5. Validate — Check & Register
```bash
npm run pipeline:validate
```
Reads every GLB with gltf-transform, extracts stats, generates checksums. Outputs:
- `web/api/pipeline-models.json` — full model registry
- `web/api/pipeline-manifest.json` — checksums for cache busting

### 6. Sync
```bash
# Copy to ObjectStore (local)
npm run sync:objectstore

# Upload to R2 CDN
npm run sync:r2

# Verify
npm run sync:verify
```

## Adding New Assets

1. Drop ZIP/FBX/OBJ files into `attackmotion/`
2. Add entry to `ingest/organize.ps1` zipMap if needed
3. Run `powershell -File ingest/organize.ps1`
4. Run `npm run pipeline`
5. Review output in web dashboard
6. Run `npm run sync:objectstore && npm run sync:r2`

## CLI Options

All pipeline commands support:
- `--dry-run` — show what would happen without making changes
- `--category=NAME` — filter to specific category
- `--verbose` / `-v` — detailed output per file

## Directory Structure

```
grudge-pipeline/
├── attackmotion/          # Raw asset ZIPs (gitignored)
│   └── _organized/        # Extracted + categorized (gitignored)
├── _converted/            # FBX→GLB output (gitignored)
├── _optimized/            # Final optimized GLBs (gitignored)
├── pipeline/              # Pipeline scripts
├── avatar/                # Avatar system specs
├── ingest/                # Organization + scanning
├── web/                   # Dashboard frontend (Vercel)
├── sync/                  # ObjectStore + R2 sync
└── docs/                  # Documentation
```
