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
```

### Flags

- `--drives=<a,b,..>` — drive roots / folders to scan (default `C:\,D:\,F:\`)
- `--canonical=<path>` — authoritative repo home (default `F:\github`)
- `--report-dir=<path>` — where reports + quarantine go (default `F:\_organization\<timestamp>`)
- `--min-size=<bytes>` — ignore duplicate files smaller than this (default `65536` = 64 KB)
- `--stale-days=<n>` — flag files older than n days as old/legacy (default `180`)
- `--include-repo-files` — also scan files *inside* git repos (default off)
- `--exclude=<a,b,..>` — extra directory names to skip
- `--apply` — actually perform the moves (otherwise dry-run)
- `--help` — print built-in help

## Recommended workflow

1. Run a dry-run and open `report.json` / the CSVs.
2. Manually commit & push any repos flagged as **dirty** so no work is lost.
3. Re-run with `--apply` to consolidate repos and quarantine duplicates.
4. Open `largest.csv` and `stale.csv` and delete the old/legacy files you no
   longer want (this part is manual on purpose — "legacy" is a judgment call).
5. Verify `F:\github` looks right and your assets are intact.
6. Delete the `quarantine/` folder to reclaim the duplicate space.
