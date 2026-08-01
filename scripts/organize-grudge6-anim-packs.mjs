/**
 * Review / re-organize grudge6 Mixamo author packs into fleet folders.
 *
 * Source review (2026-08-01): Documents/*.zip → _anim_packs/grudge6_incoming_*
 * Fleet author dirs: D:/Games/Models/_anim_packs/{pistol,rifle,farming,magic_loco,locomotion,…}
 *
 * Runtime SSOT remains Bip001 baked JSON:
 *   https://open.grudge-studio.com/anims/baked/{pack}/{clip}.json
 * Pack map: web/api/grudge6-anim-packs.json
 *
 * Usage: node scripts/organize-grudge6-anim-packs.mjs
 */
import { readdirSync, statSync, copyFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';

const AUTHOR = process.env.GRUDGE_ANIM_ROOT || 'D:/Games/Models/_anim_packs';
const INCOMING = join(AUTHOR, 'grudge6_incoming_2026-08-01');

const MAP = {
  pistol: ['grudgepistolzio', 'grudge6wandandpistols', '25bonePistol_Handgun-Locomotion-Pack'],
  rifle: ['grudge6gun', '25boneShooter-Pack', '25boneSlim-Shooter-Pack'],
  farming: ['grudgeFarming-Pack'],
  magic_loco: ['grudge6Magic-Locomotion-Pack'],
  locomotion: ['grudge6Locomotion-Pack', 'grudge-8-Way-Locomotion-Pack'],
  action_adventure: ['grudgeAction-Adventure-Pack'],
};

function walkFbx(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFbx(p, out);
    else if (/\.fbx$/i.test(name) && !/heavy_mixamo|mixamo\.fbx/i.test(name)) out.push(p);
  }
  return out;
}

const report = { packs: {}, skippedMannequin: 0 };
for (const [pack, srcs] of Object.entries(MAP)) {
  const dest = join(AUTHOR, pack);
  mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const src of srcs) {
    const root = join(INCOMING, src);
    for (const f of walkFbx(root)) {
      const name = basename(f);
      copyFileSync(f, join(dest, name));
      n++;
    }
  }
  const files = existsSync(dest)
    ? readdirSync(dest).filter((f) => /\.fbx$/i.test(f))
    : [];
  report.packs[pack] = { files: files.length, samples: files.slice(0, 12) };
  console.info(`${pack}: ${files.length} fbx`);
}

const outJson = join(AUTHOR, 'grudge6-incoming-organize-report.json');
writeFileSync(outJson, JSON.stringify(report, null, 2));
console.info('wrote', outJson);
console.info('SSOT manifest: web/api/grudge6-anim-packs.json');
console.info('Next: bake Mixamo → Bip001 JSON → upload anims/baked/{pack}/');
