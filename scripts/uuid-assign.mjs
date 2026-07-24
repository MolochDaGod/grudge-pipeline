#!/usr/bin/env node
/**
 * Assign / repair grudgeUuid on catalog JSON (meshes / assets).
 * Usage:
 *   node scripts/uuid-assign.mjs path/to/catalog.json [--write] [--report out.json]
 */
import fs from 'fs';
import path from 'path';
import { grudgeUuidFromR2Key, normalizeR2Key, verifyPair } from './lib/grudgeUuid.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const reportIdx = args.indexOf('--report');
const reportPath = reportIdx >= 0 ? args[reportIdx + 1] : null;
const file = args.find((a) => !a.startsWith('--') && a !== reportPath);

if (!file) {
  console.error('Usage: node scripts/uuid-assign.mjs <catalog.json> [--write] [--report out.json]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const list = raw.meshes || raw.assets || (Array.isArray(raw) ? raw : null);
if (!list) {
  console.error('No meshes/assets array in', file);
  process.exit(1);
}

const report = { file, total: list.length, ok: 0, fixed: 0, derived: 0, mismatch: 0, invalid: 0, rows: [] };

for (const item of list) {
  const r2Key = normalizeR2Key(item.r2Key || item.path || (item.id ? `models/codex/${item.id}.glb` : ''));
  if (!r2Key && !item.id) continue;
  const key = r2Key || `models/codex/${item.id}.glb`;
  const expected = grudgeUuidFromR2Key(key);
  const before = item.grudgeUuid || null;
  const v = verifyPair(key, before);

  if (v.status === 'ok') report.ok++;
  else if (v.status === 'derived') report.derived++;
  else if (v.status === 'mismatch') report.mismatch++;
  else if (v.status === 'invalid') report.invalid++;

  if (write) {
    if (!item.r2Key) item.r2Key = key;
    if (!item.grudgeUuid || v.status === 'mismatch' || v.status === 'invalid' || v.status === 'derived') {
      if (item.grudgeUuid && item.grudgeUuid !== expected) report.fixed++;
      item.grudgeUuid = expected;
    }
    if (!item.cdnUrl && key.startsWith('models/')) {
      item.cdnUrl = `https://assets.grudge-studio.com/${key}`;
    }
  }

  if (v.status !== 'ok') {
    report.rows.push({
      id: item.id,
      r2Key: key,
      before,
      after: expected,
      status: v.status,
      message: v.message,
    });
  }
}

if (write) {
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  console.log(`[uuid-assign] wrote ${file}`);
}

console.log(
  `[uuid-assign] total=${report.total} ok=${report.ok} derived=${report.derived} mismatch=${report.mismatch} invalid=${report.invalid} fixed=${report.fixed}`,
);

if (reportPath) {
  fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[uuid-assign] report → ${reportPath}`);
}

process.exit(report.mismatch + report.invalid > 0 && !write ? 2 : 0);
