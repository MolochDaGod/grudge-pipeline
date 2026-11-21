/**
 * Scan local model roots + purchased archives into web/api/convert-queue.json.
 * Pack-level. Does not upload and does not invent UUIDs for files that are not on R2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { grudgeUuidFromR2Key } from './lib/grudgeUuid.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const outPath = path.join(repo, 'web', 'api', 'convert-queue.json');

const roots = [
  { id: 'pipeline-root', dir: repo, depth: 1 },
  { id: 'organized', dir: path.join(repo, 'attackmotion', '_organized'), depth: 2 },
  { id: 'games-models', dir: 'D:\\Games\\Models', depth: 2 },
];

const MODEL_EXT = new Set(['.glb', '.gltf', '.fbx', '.obj', '.dae']);
const TEX_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tga']);
const SKIP = new Set(['node_modules', '.git', 'tmp', 'web', 'reports', 'grudge-export']);

function slug(name) {
  return String(name)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function loadCodexByStem() {
  const byStem = new Map();
  const catalogPath = 'D:/Games/Models/_codex_prod/catalog.json';
  if (!fs.existsSync(catalogPath)) return byStem;
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  for (const mesh of catalog.meshes || []) {
    const base = path.basename(mesh.r2Key || '').toLowerCase();
    if (base) byStem.set(base, mesh);
  }
  return byStem;
}

const codexByStem = loadCodexByStem();

function stampMesh(fileName, packName) {
  const ext = path.extname(fileName).toLowerCase();
  if (!MODEL_EXT.has(ext)) return null;
  const base = path.basename(fileName, ext);
  const known = codexByStem.get(`${base}.glb`.toLowerCase());
  if (known?.r2Key) {
    return {
      file: fileName,
      r2Key: known.r2Key,
      grudgeUuid: known.grudgeUuid || grudgeUuidFromR2Key(known.r2Key),
      uuidState: 'catalog',
    };
  }
  const r2Key = `models/local/${slug(packName)}/${slug(base)}.glb`;
  return {
    file: fileName,
    r2Key,
    grudgeUuid: grudgeUuidFromR2Key(r2Key),
    uuidState: 'intended',
  };
}

function countDir(dir, depth) {
  const counts = { glb: 0, fbx: 0, obj: 0, png: 0, zip: 0 };
  const samples = [];
  const stack = [{ dir, depth }];
  let seen = 0;
  while (stack.length && seen < 4000) {
    const cur = stack.pop();
    let names = [];
    try {
      names = fs.readdirSync(cur.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of names) {
      if (ent.name.startsWith('.') || SKIP.has(ent.name)) continue;
      const full = path.join(cur.dir, ent.name);
      if (ent.isDirectory()) {
        if (cur.depth > 0) stack.push({ dir: full, depth: cur.depth - 1 });
        continue;
      }
      seen++;
      const ext = path.extname(ent.name).toLowerCase();
      if (ext === '.glb' || ext === '.gltf') counts.glb++;
      else if (ext === '.fbx' || ext === '.dae') counts.fbx++;
      else if (ext === '.obj') counts.obj++;
      else if (TEX_EXT.has(ext)) counts.png++;
      else if (ext === '.zip' || ext === '.7z' || ext === '.rar') counts.zip++;
      if (samples.length < 6 && MODEL_EXT.has(ext)) {
        const stamped = stampMesh(ent.name, path.basename(dir));
        if (stamped) samples.push(stamped);
      }
    }
  }
  return { counts, samples };
}

const packs = [];

for (const root of roots) {
  if (!fs.existsSync(root.dir)) continue;
  let names = [];
  try {
    names = fs.readdirSync(root.dir, { withFileTypes: true });
  } catch {
    continue;
  }
  for (const ent of names) {
    if (ent.name.startsWith('.') || SKIP.has(ent.name)) continue;
    const full = path.join(root.dir, ent.name);
    if (root.id === 'pipeline-root' && ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (!['.zip', '.7z', '.rar'].includes(ext)) continue;
      const textureName = /grass|floor|wall|roof|sand|snow|wood|metal|fur|flesh|lava|water|stone|hedge|parquet|plank/i.test(ent.name);
      packs.push({
        id: slug(ent.name),
        name: ent.name,
        source: full,
        kind: textureName ? 'texture-pack' : 'purchased-zip',
        counts: { zip: 1 },
        samples: [],
        uuidState: 'none',
      });
      continue;
    }
    if (!ent.isDirectory()) continue;
    if (root.id === 'pipeline-root') continue;
    const { counts, samples } = countDir(full, root.depth);
    const convertible = counts.glb + counts.fbx + counts.obj + counts.zip > 0;
    if (!convertible && counts.png === 0) continue;
    packs.push({
      id: `${root.id}-${slug(ent.name)}`,
      name: ent.name,
      source: full,
      kind: convertible ? 'local-folder' : 'texture-pack',
      counts,
      samples,
    });
  }
}

packs.sort((a, b) => a.name.localeCompare(b.name));
const doc = {
  version: 1,
  generated: new Date().toISOString(),
  note: 'Catalog meshes reuse models/codex keys and their grudgeUuid. Other meshes use models/local and a derived UUID. Texture packs and zip archives have no asset UUID.',
  roots: roots.map((r) => r.dir).filter((d) => fs.existsSync(d)),
  packs,
};
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
console.log('packs', packs.length, '→', outPath);
