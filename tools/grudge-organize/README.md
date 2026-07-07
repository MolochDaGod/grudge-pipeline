# grudge-organize

A **safe, zero-dependency** command-line tool to seek out and organize files,
duplicates, and Git repositories across your drives. It treats **`F:\github`**
as the canonical / most-up-to-date home for repos and **`F:`** as the primary
drive for assets and organization.

Runs locally on your own machine (Windows, macOS, or Linux). Only Node.js
(v20+, which you already have) is required — no `npm install`.

## What it does

1. **Git repo inventory** — finds every repository across the target drives,
   groups them by their `origin` remote URL, and detects the *same* repo cloned
   in more than one place. It flags:
   - repos **missing from** `F:\github` (candidates to move in),
   - **redundant clean clones** elsewhere (candidates to quarantine),
   - repos with **uncommitted changes** (left untouched — review these yourself).
2. **Duplicate files** — matches files by size, then SHA-256 hash, reports how
   much space is reclaimable, and prefers keeping the copy already on `F:`.
3. **Old / legacy & space hogs** — reports the largest files and everything
   older than `--stale-days` (default 180) so you can hand-pick old/legacy junk
   to delete and reclaim space fast.
4. **Reports** — writes `repos.csv`, `duplicates.csv`, `largest.csv`,
   `stale.csv`, and a full `report.json` you can review before changing anything.
5. **Consolidate (`--consolidate=<dir>`)** — builds **one deduplicated copy** of
   every scanned file (≥ `--min-size`) into `<dir>`, keeping a single instance
   per unique content hash. This is **fully non-destructive** — it only ever
   *copies*, so it is safe to run against live repos and gives you one organized
   asset library (e.g. on `F:`) to push to object storage. Also writes
   `consolidated-index.csv` (hash → canonical copy → every source location).

## Safety model

- **Dry-run by default.** Nothing moves unless you pass `--apply`.
- **Never deletes.** With `--apply`, redundant items are *moved* to a
  timestamped `quarantine/` folder under the report directory. Delete it
  yourself once you've verified the results.
- **Dirty repos are never touched.**
- Skips system folders (`Windows`, `Program Files`, `$Recycle.Bin`, …),
  `node_modules`, symlinks/junctions, and files below `--min-size`.
- Handles cross-drive moves (e.g. `C:` → `F:`) via copy-then-remove.

## Usage

```bash
# 1) See what would happen (safe — writes reports only)
node tools/grudge-organize/grudge-organize.mjs

# 2) Review the reports, then consolidate for real
node tools/grudge-organize/grudge-organize.mjs --apply

# Limit scope for a faster first pass
node tools/grudge-organize/grudge-organize.mjs --drives=D:\,F:\

# Build ONE deduplicated copy of every asset into F:\assets (non-destructive)
node tools/grudge-organize/grudge-organize.mjs --include-repo-files --consolidate=F:\assets --apply
```

### Flags

- `--drives=<a,b,..>` — drive roots / folders to scan (default `C:\,D:\,F:\`)
- `--canonical=<path>` — authoritative repo home (default `F:\github`)
- `--report-dir=<path>` — where reports + quarantine go (default `F:\_organization\<timestamp>`)
- `--min-size=<bytes>` — ignore duplicate files smaller than this (default `65536` = 64 KB)
- `--stale-days=<n>` — flag files older than n days as old/legacy (default `180`)
- `--include-repo-files` — also scan files *inside* git repos (default off)
- `--exclude=<a,b,..>` — extra directory names to skip
- `--consolidate=<dir>` — build one deduped copy of every file into `<dir>` (non-destructive copy; lower `--min-size=1` to include small files too)
- `--apply` — actually perform the moves / copies (otherwise dry-run)
- `--help` — print built-in help

## Recommended workflow

1. Run a dry-run and open `report.json` / the CSVs.
2. Manually commit & push any repos flagged as **dirty** so no work is lost.
3. Re-run with `--apply` to consolidate repos and quarantine duplicates.
4. Open `largest.csv` and `stale.csv` and delete the old/legacy files you no
   longer want (this part is manual on purpose — "legacy" is a judgment call).
5. Verify `F:\github` looks right and your assets are intact.
6. Delete the `quarantine/` folder to reclaim the duplicate space.
## Offloading assets to object storage (`grudge-asset-offload.mjs`)
The biggest, systemic bloat is heavy binary assets (textures, models, zips)
mirrored across deploy folders and repos. The durable fix is to host **one
copy** in object storage and reference it by URL. This companion tool uploads
each unique asset to your **Cloudflare R2** bucket using **content-addressed**
keys (`assets/<sha256>.<ext>`), so every duplicate across every repo collapses
to a single object automatically.
It is **safe by default** (dry-run) and **never edits or deletes your files** —
it only uploads copies and writes a manifest you use to update references.
```bash
# 1) Dry-run: inventory + manifest (no credentials needed)
node tools/grudge-organize/grudge-asset-offload.mjs --repo=F:\github\Dungeon-Crawler-Quest
# 2) Upload one copy of each unique asset to R2 (needs R2_* env vars)
node tools/grudge-organize/grudge-asset-offload.mjs --repo=F:\github\Dungeon-Crawler-Quest --apply
```
Required env for `--apply`: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (and `R2_PUBLIC_BASE_URL` for the manifest
URLs). These match `grudge-pipeline`'s `.env.example`.
Outputs (in `--report-dir`): `offload-manifest.csv` / `.json`
(source path -> object key -> public URL) and `gitignore-suggestions.txt`.
Recommended sequence:
1. Dry-run and review `offload-manifest.csv`.
2. `--apply` to upload; confirm the URLs load in a browser.
3. Update code references from local paths to the object-storage URLs.
4. After verifying, `git rm` the local copies and add the gitignore entries.
## Reclaiming git *clone* size (advanced / destructive)
Deleting big files in a normal commit stops future bloat but the blobs stay in
history, so `git clone` size is unchanged. To actually shrink the repo you must
rewrite history with [`git filter-repo`](https://github.com/newren/git-filter-repo).
**This rewrites every commit SHA and requires a force-push — coordinate with
anyone else using the repo and back up first.** Run it yourself; do not automate.
```bash
# Back up, then in a FRESH full clone (not a partial/blobless clone):
git clone https://github.com/MolochDaGod/Dungeon-Crawler-Quest dcq-shrink && cd dcq-shrink
pip install git-filter-repo
git filter-repo --invert-paths --path public/assets/models/campfire/CampfireSpookyStories_v0.95/
git push origin --force --all && git push origin --force --tags
# Everyone else must then re-clone (their old clones are now incompatible).
```
