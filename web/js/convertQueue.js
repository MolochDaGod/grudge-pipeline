/**
 * Local /model + purchased packs that can become GLB.
 * The queue JSON is a scan of disk. UUIDs are derived only for an intended R2 key.
 */
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

let packCache = null;

export async function loadConvertQueue() {
  if (packCache) return packCache;
  const r = await fetch('api/convert-queue.json', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(String(r.status));
  packCache = await r.json();
  return packCache;
}

async function paint() {
  const list = document.getElementById('convertList');
  const meta = document.getElementById('convertMeta');
  if (!list) return;
  list.innerHTML = '<p class="muted">Loading local /model queue…</p>';
  let data;
  try {
    data = await loadConvertQueue();
  } catch (e) {
    list.innerHTML = `<p class="muted">convert-queue.json missing (${esc(e.message)}).</p>`;
    return;
  }
  const packs = data.packs || [];
  const q = (document.getElementById('convertSearch')?.value || '').trim().toLowerCase();
  const kind = document.getElementById('convertKind')?.value || '';
  const rows = packs.filter((p) => {
    if (kind && p.kind !== kind) return false;
    if (!q) return true;
    return `${p.name} ${p.source} ${p.kind}`.toLowerCase().includes(q);
  });
  if (meta) {
    meta.textContent = `${packs.length} packs · scanned ${data.generated || ''}`;
  }
  const html = await Promise.all(
    rows.slice(0, 60).map(async (p) => {
      const counts = p.counts || {};
      const countLine = ['glb', 'fbx', 'obj', 'png', 'zip']
        .filter((k) => counts[k])
        .map((k) => `${counts[k]} ${k}`)
        .join(' · ');
      const sample = (p.samples || []).find((s) => s.grudgeUuid) || null;
      const uuidHtml = sample
        ? `<button type="button" class="ghost-btn copy-uuid" data-uuid="${esc(sample.grudgeUuid)}">Copy UUID</button> <code>${esc(sample.grudgeUuid)}</code><div class="need-sample">${esc(sample.uuidState || '')} · ${esc(sample.r2Key || '')}</div>`
        : '<span class="muted">No mesh key. Texture packs and zip archives do not get an asset UUID.</span>';
      return `<article class="need-card">
        <div class="need-title">${esc(p.name)}</div>
        <div class="need-meta"><span class="need-badge ${p.kind === 'texture-pack' ? 'partial' : 'planned'}">${esc(p.kind)}</span><span>${esc(countLine || 'archive')}</span></div>
        <div class="need-sample">${esc(p.source || '')}</div>
        <div class="btn-row">${uuidHtml}</div>
      </article>`;
    }),
  );
  list.innerHTML = html.length
    ? `<div class="gap-grid">${html.join('')}</div>`
    : '<p class="muted">No packs match.</p>';
  list.querySelectorAll('.copy-uuid').forEach((btn) => {
    btn.addEventListener('click', () => navigator.clipboard?.writeText(btn.dataset.uuid || ''));
  });
}

export function mountConvertView() {
  document.getElementById('convertSearch')?.addEventListener('input', () => void paint());
  document.getElementById('convertKind')?.addEventListener('change', () => void paint());
}

export function showConvert() {
  void paint();
}
