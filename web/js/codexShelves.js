/**
 * Era codex shelves for grudge-pipeline.
 * Reads the existing definition hosts. Does not write a second catalog.
 * Asset UUID is sha1("grudge-asset:"+r2Key) only when a mesh key exists.
 */
import { grudgeUuidFromR2Key, isValidUuid } from './uuid-verify.js';

const INFO = 'https://info.grudge-studio.com/api/v1';
const MINE = 'https://mineloader.grudge-studio.com';

const WARLORDS_FILES = [
  'weapons.json',
  'equipment.json',
  'materials.json',
  'armor.json',
  'races.json',
  'professions.json',
  'classes.json',
  'master-items.json',
  'master-weaponSkills.json',
  'master-recipes.json',
  'grudge6-gear-presets.json',
  'grudge6-canonical.json',
];

const NEXUS_FILES = ['nexus.json', 'nexus-codex.json', 'mechs.json', 'carrier.json'];

const shelves = {
  warlords: [],
  voxel: [],
  nexus: [],
};
const notes = { warlords: '', voxel: '', nexus: '' };
let loaded = false;
let loading = null;

function walkRows(node, catalog, out, depth) {
  if (!node || depth > 8 || out.length > 8000) return;
  if (Array.isArray(node)) {
    for (const item of node) walkRows(item, catalog, out, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;
  const id = node.id || node.slug || node.key || node.templateId;
  const name = node.name || node.title || node.label;
  if (id && name && typeof name === 'string') {
    const mesh =
      node.r2Key ||
      node.modelPath ||
      node.mesh ||
      node.glb ||
      node.assetUrl ||
      node.prefab ||
      '';
    const meshKey = String(mesh || '')
      .replace(/^https?:\/\/assets\.grudge-studio\.com\//i, '')
      .replace(/^\//, '');
    out.push({
      id: String(id),
      name: String(name),
      catalog,
      category: node.category || node.grudgeType || '',
      meshKey: /\.(glb|gltf|fbx)$/i.test(meshKey) ? meshKey : '',
      icon: node.icon || node.imageUrl || node.iconUrl || '',
    });
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') walkRows(value, catalog, out, depth + 1);
  }
}

async function fetchJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(String(r.status));
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html')) throw new Error('html');
  return r.json();
}

async function loadFile(base, file, era) {
  try {
    const json = await fetchJson(`${base}/${file}`);
    const before = shelves[era].length;
    walkRows(json, file.replace(/\.json$/, ''), shelves[era], 0);
    return shelves[era].length - before;
  } catch {
    return -1;
  }
}

async function loadVoxel() {
  let offset = 0;
  const page = 200;
  let total = Infinity;
  while (offset < total && shelves.voxel.length < 2500) {
    const json = await fetchJson(`${MINE}/api/blocks?limit=${page}&offset=${offset}`);
    total = Number(json.total) || shelves.voxel.length;
    const blocks = json.blocks || [];
    if (!blocks.length) break;
    for (const b of blocks) {
      shelves.voxel.push({
        id: String(b.slug || b.id),
        name: String(b.name || b.slug || b.id),
        catalog: 'blocks',
        category: b.category || '',
        meshKey: '',
        icon: b.imageUrl || '',
      });
    }
    offset += blocks.length;
    if (blocks.length < page) break;
  }
}

export async function ensureCodex() {
  if (loaded) return shelves;
  if (loading) return loading;
  loading = (async () => {
    const counts = [];
    for (const file of WARLORDS_FILES) {
      const n = await loadFile(INFO, file, 'warlords');
      if (n >= 0) counts.push(`${file.replace('.json', '')} ${n}`);
    }
    notes.warlords = counts.length
      ? counts.join(' · ')
      : 'Warlords catalogs did not load from info.grudge-studio.com';
    try {
      await loadVoxel();
      notes.voxel = `${shelves.voxel.length} blocks from Mine-Loader /api/blocks`;
    } catch (e) {
      notes.voxel = `Voxel Codex unavailable (${e.message})`;
    }
    const nexusHits = [];
    for (const file of NEXUS_FILES) {
      const n = await loadFile(INFO, file, 'nexus');
      if (n > 0) nexusHits.push(`${file} ${n}`);
    }
    notes.nexus = nexusHits.length
      ? nexusHits.join(' · ')
      : 'Nexus Codex is not published on info yet. Heroes stay era=nexus. No invented mech list.';
    for (const era of Object.keys(shelves)) {
      const seen = new Set();
      shelves[era] = shelves[era].filter((row) => {
        const k = `${row.catalog}:${row.id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    loaded = true;
    return shelves;
  })();
  return loading;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

async function paint() {
  const list = document.getElementById('codexList');
  const meta = document.getElementById('codexMeta');
  const shelf = document.getElementById('codexShelf')?.value || 'warlords';
  const q = (document.getElementById('codexSearch')?.value || '').trim().toLowerCase();
  if (!list || !meta) return;
  list.innerHTML = '<p class="muted">Loading codex…</p>';
  await ensureCodex();
  let rows = shelves[shelf] || [];
  if (q) {
    rows = rows.filter((r) =>
      `${r.name} ${r.id} ${r.catalog} ${r.category}`.toLowerCase().includes(q),
    );
  }
  const shown = rows.slice(0, 80);
  meta.innerHTML = `<span class="bar-summary">${(shelves[shelf] || []).length.toLocaleString()} on this shelf</span> <span class="muted">${esc(notes[shelf] || '')}</span>`;
  if (!shown.length) {
    list.innerHTML = `<p class="muted">${esc(notes[shelf] || 'Nothing on this shelf.')}</p>`;
    return;
  }
  const html = await Promise.all(
    shown.map(async (row) => {
      let uuid = '';
      if (row.meshKey) {
        try {
          uuid = (await grudgeUuidFromR2Key(row.meshKey)) || '';
        } catch {
          uuid = '';
        }
      }
      const uuidLine = uuid && isValidUuid(uuid)
        ? `<button type="button" class="ghost-btn copy-uuid" data-uuid="${esc(uuid)}">Copy asset UUID</button> <code>${esc(uuid)}</code>`
        : '<span class="muted">No mesh r2Key — definition id only, not an asset UUID</span>';
      return `<article class="need-card">
        <div class="need-title">${esc(row.name)}</div>
        <div class="need-meta"><span class="need-badge runtime">${esc(row.catalog)}</span><code>${esc(row.id)}</code></div>
        <div class="need-sample">${row.meshKey ? esc(row.meshKey) : esc(row.category || row.icon || 'definition')}</div>
        <div class="btn-row">${uuidLine}<button type="button" class="ghost-btn copy-def" data-id="${esc(row.id)}">Copy id</button></div>
      </article>`;
    }),
  );
  list.innerHTML = `<p class="muted">Showing ${shown.length} of ${rows.length.toLocaleString()}. Search narrows the shelf.</p><div class="gap-grid">${html.join('')}</div>`;
  list.querySelectorAll('.copy-uuid').forEach((btn) => {
    btn.addEventListener('click', () => navigator.clipboard?.writeText(btn.dataset.uuid || ''));
  });
  list.querySelectorAll('.copy-def').forEach((btn) => {
    btn.addEventListener('click', () => navigator.clipboard?.writeText(btn.dataset.id || ''));
  });
}

export function mountCodexView() {
  document.getElementById('codexShelf')?.addEventListener('change', () => void paint());
  document.getElementById('codexSearch')?.addEventListener('input', () => void paint());
}

export function showCodex() {
  void paint();
}
