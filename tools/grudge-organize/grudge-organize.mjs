#!/usr/bin/env node
/**
 * grudge-organize.mjs
 * ------------------------------------------------------------------------
 * Seek out and organize files, duplicates, and Git repos across your drives.
 *
 * Treats F:\github as the canonical / most-up-to-date location for repos and
 * F: as the primary drive for assets & organization.
 *
 * SAFE BY DEFAULT: runs in dry-run (report only). Nothing is moved or deleted
 * unless you pass --apply, and even then files are MOVED to a quarantine
 * folder (never hard-deleted) and repos with uncommitted changes are skipped.
 *
 * Zero dependencies — uses only Node built-ins. Works on Windows, macOS, Linux.
 *
 * USAGE (Windows, from anywhere):
 *   node grudge-organize.mjs                     # dry run, writes reports
 *   node grudge-organize.mjs --apply             # consolidate + quarantine
 *   node grudge-organize.mjs --drives=D:\,F:\    # limit scope (faster)
 *   node grudge-organize.mjs --help
 *
 * KEY FLAGS:
 *   --drives=<a,b,..>      Drive roots / folders to scan (default C:\,D:\,F:\)
 *   --canonical=<path>     Authoritative repo home         (default F:\github)
 *   --report-dir=<path>    Where reports + quarantine go    (default F:\_organization\<ts>)
 *   --min-size=<bytes>     Ignore dup files smaller than    (default 65536 = 64KB)
 *   --stale-days=<n>       Flag files older than n days     (default 180)
 *   --include-repo-files   Also scan files inside git repos (default off)
 *   --exclude=<a,b,..>     Extra directory names to skip
 *   --consolidate=<dir>    Build ONE deduped copy of every file into <dir>
 *                          (non-destructive: only ever COPIES; e.g. F:\assets)
 *   --apply                Actually perform moves / copies (otherwise dry-run)
 * ------------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------- args ----
function parseArgs(argv) {
  const a = { _: [] };
  for (const tok of argv) {
    if (tok.startsWith('--')) {
      const [k, ...rest] = tok.slice(2).split('=');
      a[k] = rest.length ? rest.join('=') : true;
    } else a._.push(tok);
  }
  return a;
}
const ARGS = parseArgs(process.argv.slice(2));

function printHelp() {
  const banner = fs.readFileSync(new URL(import.meta.url)).toString()
    .split('\n').filter(l => l.startsWith(' *') || l.startsWith('/**'))
    .map(l => l.replace(/^\/\*\*| \*\/?/, '').replace(/^ /, '')).join('\n');
  console.log(banner);
}
if (ARGS.help || ARGS.h) { printHelp(); process.exit(0); }

const isWin = process.platform === 'win32';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);

const DEFAULT_DRIVES = isWin ? ['C:\\', 'D:\\', 'F:\\'] : [process.cwd()];
const DRIVES = (ARGS.drives ? String(ARGS.drives).split(',') : DEFAULT_DRIVES)
  .map(s => s.trim()).filter(Boolean)
  .filter(d => { try { return fs.existsSync(d); } catch { return false; } });

const CANONICAL = ARGS.canonical
  ? String(ARGS.canonical)
  : (isWin ? 'F:\\github' : path.join(DRIVES[0] || process.cwd(), 'github'));

const MIN_SIZE = ARGS['min-size'] ? parseInt(ARGS['min-size'], 10) : 64 * 1024;
const STALE_DAYS = ARGS['stale-days'] ? parseInt(ARGS['stale-days'], 10) : 180;
const APPLY = !!ARGS.apply;
const INCLUDE_REPO_FILES = !!ARGS['include-repo-files'];
const CONSOLIDATE = ARGS.consolidate ? String(ARGS.consolidate) : null;

let REPORT_DIR = ARGS['report-dir']
  ? String(ARGS['report-dir'])
  : (isWin ? `F:\\_organization\\${STAMP}` : path.join(process.cwd(), `grudge-organize-report_${STAMP}`));
let QUARANTINE = path.join(REPORT_DIR, 'quarantine');

const EXCLUDE = new Set([
  'node_modules', '.git', '$Recycle.Bin', '$RECYCLE.BIN', 'System Volume Information',
  'Windows', 'Program Files', 'Program Files (x86)', 'ProgramData', 'Recovery',
  'PerfLogs', '.Trash', '.cache', '.npm', '.gradle',
  ...(ARGS.exclude ? String(ARGS.exclude).split(',').map(s => s.trim()) : []),
]);

// ------------------------------------------------------------- helpers ----
function norm(p) { const r = path.resolve(p); return isWin ? r.toLowerCase() : r; }
function isUnder(child, parent) {
  const c = norm(child), pa = norm(parent);
  const paSep = pa.endsWith(path.sep) ? pa : pa + path.sep;
  return c === pa || c.startsWith(paSep);
}
function rootOf(p) { return path.parse(path.resolve(p)).root; }
function driveTag(p) { return rootOf(p).replace(/[:\\/]/g, '') || 'root'; }

const PREF_ROOT = rootOf(CANONICAL);              // e.g. 'F:\'
function onPreferredDrive(p) { return norm(p).startsWith(norm(PREF_ROOT)); }

let GIT_OK = false;
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); GIT_OK = true; } catch { /* no git */ }
function git(cwd, gitArgs) {
  try {
    return execFileSync('git', gitArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}
function normRemote(url) {
  if (!url) return '';
  let u = url.trim().toLowerCase().replace(/\.git$/, '');
  u = u.replace(/^git@([^:]+):/, '$1/').replace(/^ssh:\/\//, '').replace(/^https?:\/\//, '');
  return u.replace(/\/+$/, '');
}

function sha256(file) {
  try {
    const h = crypto.createHash('sha256');
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(1 << 20);
    try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); }
    finally { fs.closeSync(fd); }
    return h.digest('hex');
  } catch { return ''; }
}

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
function copyRecursive(src, dest) {
  const st = fs.lstatSync(src);
  if (st.isDirectory()) {
    ensureDir(dest);
    for (const e of fs.readdirSync(src)) copyRecursive(path.join(src, e), path.join(dest, e));
  } else {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}
/** Move across volumes safely (rename, else copy+verify+remove). Never used unless --apply. */
function movePath(src, dest) {
  ensureDir(path.dirname(dest));
  try { fs.renameSync(src, dest); return; }
  catch (e) { if (e.code !== 'EXDEV') throw e; }
  copyRecursive(src, dest);
  fs.rmSync(src, { recursive: true, force: true });
}
function quarantineDest(srcPath) {
  const rel = path.relative(rootOf(srcPath), srcPath);
  return path.join(QUARANTINE, driveTag(srcPath), rel);
}

function fmtBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}
function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
function csv(rows) { return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n'; }

// ------------------------------------------------------- filesystem walk ---
const repos = [];
const filesBySize = new Map();   // size -> [{path,size,mtime}]
let scannedDirs = 0, scannedFiles = 0;

// space / aging trackers (report-only — never used to delete anything)
let totalBytes = 0, staleCount = 0, staleBytes = 0;
const STALE_CUTOFF = Date.now() - STALE_DAYS * 86400000;
const TOP_KEEP = 1000;
const bigFiles = [];    // bounded top-N largest {path,size,mtime}
const staleFiles = [];  // bounded top-N largest-among-old {path,size,mtime}
function considerBig(rec) {
  bigFiles.push(rec);
  if (bigFiles.length > TOP_KEEP * 4) { bigFiles.sort((a, b) => b.size - a.size); bigFiles.length = TOP_KEEP; }
}
function considerStale(rec) {
  staleFiles.push(rec);
  if (staleFiles.length > TOP_KEEP * 4) { staleFiles.sort((a, b) => b.size - a.size); staleFiles.length = TOP_KEEP; }
}
function ageDays(mtimeMs) { return Math.floor((Date.now() - mtimeMs) / 86400000); }

function walk(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    scannedDirs++;
    if (scannedDirs % 2000 === 0) process.stderr.write(`  ...scanned ${scannedDirs} dirs, ${scannedFiles} files\r`);

    let isRepo = false;
    try { isRepo = fs.existsSync(path.join(dir, '.git')); } catch { /* ignore */ }
    if (isRepo) { repos.push(dir); if (!INCLUDE_REPO_FILES) continue; }

    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;                       // avoid junction/symlink loops
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (EXCLUDE.has(e.name)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        scannedFiles++;
        let st; try { st = fs.statSync(full); } catch { continue; }
        if (!st.isFile()) continue;
        totalBytes += st.size;
        if (st.size < MIN_SIZE) continue;
        const rec = { path: full, size: st.size, mtime: st.mtimeMs };
        const arr = filesBySize.get(st.size) || [];
        arr.push(rec);
        filesBySize.set(st.size, arr);
        considerBig(rec);
        if (st.mtimeMs <= STALE_CUTOFF) { staleCount++; staleBytes += st.size; considerStale(rec); }
      }
    }
  }
}

// ------------------------------------------------------------- git model ---
function buildRepoRecords() {
  return repos.map(p => {
    const remote = GIT_OK ? git(p, ['config', '--get', 'remote.origin.url']) : '';
    const branch = GIT_OK ? git(p, ['rev-parse', '--abbrev-ref', 'HEAD']) : '';
    const dirty = GIT_OK ? git(p, ['status', '--porcelain']).length > 0 : null;
    const last = GIT_OK ? git(p, ['log', '-1', '--format=%cI']) : '';
    const key = normRemote(remote) || ('name:' + path.basename(p).toLowerCase());
    return { path: p, drive: driveTag(p), remote, branch, dirty, lastCommit: last, key,
             underCanonical: isUnder(p, CANONICAL) };
  });
}
function cmpRepoPreferred(a, b) {
  if (onPreferredDrive(a.path) !== onPreferredDrive(b.path)) return onPreferredDrive(a.path) ? -1 : 1;
  return (b.lastCommit || '').localeCompare(a.lastCommit || '');
}
function safeRepoDest(repo) {
  let dest = path.join(CANONICAL, path.basename(repo.path));
  if (fs.existsSync(dest)) dest = `${dest}-from-${repo.drive}-${STAMP}`;
  return dest;
}

// --------------------------------------------------------- duplicate model -
function cmpFileKeeper(a, b) {
  if (onPreferredDrive(a.path) !== onPreferredDrive(b.path)) return onPreferredDrive(a.path) ? -1 : 1;
  return b.mtime - a.mtime;   // else newest wins
}
function buildDuplicateSets() {
  const sets = [];
  for (const [size, arr] of filesBySize) {
    if (arr.length < 2) continue;
    const byHash = new Map();
    for (const f of arr) {
      const h = sha256(f.path); if (!h) continue;
      const g = byHash.get(h) || []; g.push(f); byHash.set(h, g);
    }
    for (const [h, group] of byHash) {
      if (group.length > 1) {
        group.sort(cmpFileKeeper);
        sets.push({ hash: h, size, keeper: group[0], dups: group.slice(1) });
      }
    }
  }
  sets.sort((a, b) => b.size * b.dups.length - a.size * a.dups.length);
  return sets;
}

// ------------------------------------------------------ consolidate (copy) -
// Builds ONE deduplicated copy of every scanned file into destDir. This is
// fully NON-DESTRUCTIVE: it only ever reads sources and writes into destDir,
// so it is safe to run against live repos (it will not break asset references).
function consolidate(destDir) {
  console.log('-'.repeat(72));
  console.log('CONSOLIDATE — one deduplicated copy of every file into:');
  console.log(`  ${destDir}`);
  const all = [];
  for (const arr of filesBySize.values()) for (const f of arr) all.push(f);
  // canonical preference: preferred drive, then shortest path, then lexicographic
  all.sort((a, b) => {
    const pa = onPreferredDrive(a.path), pb = onPreferredDrive(b.path);
    if (pa !== pb) return pa ? -1 : 1;
    if (a.path.length !== b.path.length) return a.path.length - b.path.length;
    return a.path < b.path ? -1 : 1;
  });
  const byHash = new Map();   // hash -> [recs], first entry is the canonical pick
  let i = 0;
  for (const f of all) {
    if (++i % 500 === 0) process.stderr.write(`  hashing ${i}/${all.length}\r`);
    const h = sha256(f.path); if (!h) continue;
    const g = byHash.get(h) || []; g.push(f); byHash.set(h, g);
  }
  process.stderr.write('\r');
  let uniq = 0, uniqBytes = 0, dropped = 0, droppedBytes = 0, copied = 0, copyErr = 0;
  const idx = [['hash', 'size_bytes', 'copies', 'canonical_dest', 'sources']];
  for (const [h, group] of byHash) {
    const canonical = group[0];
    const rel = path.relative(rootOf(canonical.path), canonical.path);
    const dest = path.join(destDir, rel);
    uniq++; uniqBytes += canonical.size;
    dropped += group.length - 1; droppedBytes += canonical.size * (group.length - 1);
    if (APPLY) {
      try { if (!fs.existsSync(dest)) { ensureDir(path.dirname(dest)); fs.copyFileSync(canonical.path, dest); copied++; } }
      catch { copyErr++; }
    }
    idx.push([h, canonical.size, group.length, path.relative(destDir, dest), group.map(g => g.path).join(' | ')]);
  }
  fs.writeFileSync(path.join(REPORT_DIR, 'consolidated-index.csv'), csv(idx));
  console.log(`  unique files             : ${uniq} (${fmtBytes(uniqBytes)})`);
  console.log(`  redundant copies folded  : ${dropped} (${fmtBytes(droppedBytes)} saved vs keeping all)`);
  if (APPLY) console.log(`  files copied into library: ${copied}${copyErr ? ` (${copyErr} errors)` : ''}`);
  else console.log('  DRY-RUN: nothing copied. Re-run with --apply to build the library.');
  console.log(`  index written            : ${path.join(REPORT_DIR, 'consolidated-index.csv')}`);
  console.log('  (source files are never modified — this only ever COPIES.)');
}

// ------------------------------------------------------------------ main ---
function main() {
  console.log('='.repeat(72));
  console.log(' Grudge Drive Organizer');
  console.log('='.repeat(72));
  if (!DRIVES.length) {
    console.error('No scannable drives/paths found. Use --drives=... to specify.');
    process.exit(1);
  }
  console.log(` Mode        : ${APPLY ? 'APPLY (will move files)' : 'DRY-RUN (report only)'}`);
  console.log(` Drives      : ${DRIVES.join('  ')}`);
  console.log(` Canonical   : ${CANONICAL}`);
  console.log(` Min dup size: ${fmtBytes(MIN_SIZE)}`);
  console.log(` Git         : ${GIT_OK ? 'available' : 'NOT found (repo details limited)'}`);
  console.log('-'.repeat(72));

  console.log('Scanning...');
  for (const d of DRIVES) walk(d);
  process.stderr.write('\r');
  console.log(`Scan complete: ${scannedDirs} dirs, ${scannedFiles} files (>= ${fmtBytes(MIN_SIZE)}).`);

  // --- repos ---
  const repoRecords = buildRepoRecords();
  const groups = new Map();
  for (const r of repoRecords) { const a = groups.get(r.key) || []; a.push(r); groups.set(r.key, a); }

  const plan = { moveIntoCanonical: [], quarantineRepo: [], dirty: [] };
  for (const [, members] of groups) {
    for (const m of members) if (m.dirty) plan.dirty.push(m);
    const canon = members.filter(m => m.underCanonical);
    const nonCanon = members.filter(m => !m.underCanonical);
    if (canon.length > 0) {
      for (const m of nonCanon) if (m.dirty === false) plan.quarantineRepo.push(m);
    } else {
      const clean = nonCanon.filter(m => m.dirty !== true).sort(cmpRepoPreferred);
      if (clean.length) {
        plan.moveIntoCanonical.push({ repo: clean[0], dest: safeRepoDest(clean[0]) });
        for (const m of clean.slice(1)) plan.quarantineRepo.push(m);
      }
    }
  }
  const duplicatedRepoGroups = [...groups.values()].filter(g => g.length > 1);

  // --- duplicate files ---
  console.log('Hashing duplicate-size candidates...');
  const dupSets = buildDuplicateSets();
  const wasted = dupSets.reduce((s, d) => s + d.size * d.dups.length, 0);

  // --- console summary ---
  console.log('-'.repeat(72));
  console.log('REPOS');
  console.log(`  total found            : ${repoRecords.length}`);
  console.log(`  distinct projects       : ${groups.size}`);
  console.log(`  cloned in >1 location   : ${duplicatedRepoGroups.length}`);
  console.log(`  missing from canonical  : ${plan.moveIntoCanonical.length} (would move into ${CANONICAL})`);
  console.log(`  redundant clean clones  : ${plan.quarantineRepo.length} (would quarantine)`);
  console.log(`  with uncommitted changes: ${plan.dirty.length} (left untouched — review these!)`);
  console.log('DUPLICATE FILES');
  console.log(`  duplicate sets          : ${dupSets.length}`);
  console.log(`  reclaimable space       : ${fmtBytes(wasted)}`);
  const topBig = [...bigFiles].sort((a, b) => b.size - a.size).slice(0, 10);
  console.log('SPACE / OLD FILES (report only)');
  console.log(`  data scanned            : ${fmtBytes(totalBytes)}`);
  console.log(`  old files (>${STALE_DAYS}d)         : ${staleCount} using ${fmtBytes(staleBytes)}`);
  if (topBig.length) {
    console.log('  largest files:');
    for (const f of topBig) console.log(`    ${fmtBytes(f.size).padStart(9)}  (${ageDays(f.mtime)}d)  ${f.path}`);
  }
  console.log('-'.repeat(72));

  // --- write reports ---
  try { ensureDir(REPORT_DIR); }
  catch {
    REPORT_DIR = path.join(process.cwd(), `grudge-organize-report_${STAMP}`);
    QUARANTINE = path.join(REPORT_DIR, 'quarantine');
    ensureDir(REPORT_DIR);
    console.log(`(could not write to preferred report dir — using ${REPORT_DIR})`);
  }

  const repoRows = [['project_key', 'path', 'drive', 'branch', 'dirty', 'last_commit', 'under_canonical', 'remote']];
  for (const [key, members] of groups)
    for (const m of members)
      repoRows.push([key, m.path, m.drive, m.branch, m.dirty, m.lastCommit, m.underCanonical, m.remote]);
  fs.writeFileSync(path.join(REPORT_DIR, 'repos.csv'), csv(repoRows));

  const dupRows = [['hash', 'size_bytes', 'keeper', 'duplicate']];
  for (const s of dupSets) for (const d of s.dups) dupRows.push([s.hash, s.size, s.keeper.path, d.path]);
  fs.writeFileSync(path.join(REPORT_DIR, 'duplicates.csv'), csv(dupRows));

  const bigSorted = [...bigFiles].sort((a, b) => b.size - a.size).slice(0, TOP_KEEP);
  const bigRows = [['size_bytes', 'age_days', 'path']];
  for (const f of bigSorted) bigRows.push([f.size, ageDays(f.mtime), f.path]);
  fs.writeFileSync(path.join(REPORT_DIR, 'largest.csv'), csv(bigRows));

  const staleSorted = [...staleFiles].sort((a, b) => b.size - a.size).slice(0, TOP_KEEP);
  const staleRows = [['size_bytes', 'age_days', 'path']];
  for (const f of staleSorted) staleRows.push([f.size, ageDays(f.mtime), f.path]);
  fs.writeFileSync(path.join(REPORT_DIR, 'stale.csv'), csv(staleRows));

  fs.writeFileSync(path.join(REPORT_DIR, 'report.json'), JSON.stringify({
    generated: new Date().toISOString(), mode: APPLY ? 'apply' : 'dry-run',
    drives: DRIVES, canonical: CANONICAL, minSize: MIN_SIZE, staleDays: STALE_DAYS,
    repos: repoRecords,
    plan: {
      moveIntoCanonical: plan.moveIntoCanonical.map(x => ({ from: x.repo.path, to: x.dest })),
      quarantineRepo: plan.quarantineRepo.map(x => x.path),
      dirty: plan.dirty.map(x => x.path),
    },
    duplicateSets: dupSets.map(s => ({ hash: s.hash, size: s.size, keep: s.keeper.path, move: s.dups.map(d => d.path) })),
    reclaimableBytes: wasted,
    space: {
      totalBytes, staleCount, staleBytes,
      largest: bigSorted.slice(0, 100).map(f => ({ size: f.size, ageDays: ageDays(f.mtime), path: f.path })),
      stale: staleSorted.slice(0, 100).map(f => ({ size: f.size, ageDays: ageDays(f.mtime), path: f.path })),
    },
  }, null, 2));

  console.log(`Reports written to: ${REPORT_DIR}`);
  console.log('  - repos.csv        (every repo + which project it belongs to)');
  console.log('  - duplicates.csv   (keeper vs redundant copies)');
  console.log('  - largest.csv      (biggest files — reclaim space fast)');
  console.log(`  - stale.csv        (files older than ${STALE_DAYS}d — old/legacy candidates)`);
  console.log('  - report.json      (full machine-readable plan)');

  // --- consolidate mode: non-destructive single-copy library, then stop ---
  if (CONSOLIDATE) { consolidate(CONSOLIDATE); return; }

  // --- apply ---
  if (!APPLY) {
    console.log('-'.repeat(72));
    console.log('DRY-RUN only. Review the reports above, then re-run with --apply to:');
    console.log(`  * move ${plan.moveIntoCanonical.length} repo(s) into ${CANONICAL}`);
    console.log(`  * quarantine ${plan.quarantineRepo.length} redundant clone(s) + ${dupSets.reduce((n, s) => n + s.dups.length, 0)} duplicate file(s)`);
    console.log('  Nothing is ever deleted — items are moved to <report-dir>/quarantine.');
    console.log(`  For old/legacy cleanup, review largest.csv + stale.csv and delete by hand.`);
    return;
  }

  console.log('-'.repeat(72));
  console.log('APPLYING changes (moves only; originals preserved in quarantine)...');
  let movedRepos = 0, quarantinedRepos = 0, quarantinedFiles = 0, freed = 0;
  const errors = [];
  for (const item of plan.moveIntoCanonical) {
    const dest = safeRepoDest(item.repo);
    try { movePath(item.repo.path, dest); movedRepos++; console.log(`  moved repo -> ${dest}`); }
    catch (e) { errors.push(`repo move ${item.repo.path}: ${e.message}`); }
  }
  for (const m of plan.quarantineRepo) {
    try { movePath(m.path, quarantineDest(m.path)); quarantinedRepos++; }
    catch (e) { errors.push(`repo quarantine ${m.path}: ${e.message}`); }
  }
  for (const s of dupSets) for (const d of s.dups) {
    try { movePath(d.path, quarantineDest(d.path)); quarantinedFiles++; freed += s.size; }
    catch (e) { errors.push(`file quarantine ${d.path}: ${e.message}`); }
  }
  console.log(`Done. Repos moved: ${movedRepos}, repos quarantined: ${quarantinedRepos}, ` +
    `files quarantined: ${quarantinedFiles}, space freed on source: ${fmtBytes(freed)}.`);
  if (errors.length) {
    fs.writeFileSync(path.join(REPORT_DIR, 'errors.log'), errors.join('\n') + '\n');
    console.log(`${errors.length} error(s) logged to ${path.join(REPORT_DIR, 'errors.log')}`);
  }
  console.log(`Quarantine (safe to delete after you verify): ${QUARANTINE}`);
}

main();
