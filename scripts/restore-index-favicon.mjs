import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let html = execSync('git show origin/master:web/index.html', {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 5e6,
});
if (!/rel=["']icon["']/.test(html)) {
  html = html.replace(
    '</title>',
    '</title>\n  <link rel="icon" href="/favicon.ico" type="image/x-icon">',
  );
}
fs.writeFileSync(path.join(root, 'web/index.html'), html);
console.log('ok favicon', html.includes('favicon.ico'), 'bom', html.charCodeAt(0) === 0xfeff);
