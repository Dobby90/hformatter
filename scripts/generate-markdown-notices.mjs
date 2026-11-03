// Run after npm ci when Markdown dependencies change. Include complete license
// texts from the installed, locked packages rather than fetching remote notices.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seen = new Set();
const entries = [];
const pending = ['react-markdown', 'remark-gfm', '@codemirror/lang-markdown'].map(name => ({ parent: root, name }));
while (pending.length) {
  const { parent, name } = pending.pop();
  let folder = parent;
  let path;
  while (folder.startsWith(root)) {
    const candidate = join(folder, 'node_modules', name);
    try { await readFile(join(candidate, 'package.json')); path = candidate; break; } catch { /* Try the parent package's resolution path. */ }
    if (folder === root) break;
    folder = dirname(folder);
  }
  if (!path) throw new Error(`Cannot resolve license for ${name}`);
  if (seen.has(path)) continue;
  seen.add(path);
  const pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  const files = (await readdir(path)).filter(file => /^(licen[cs]e|copying|notice)(\.|$)/i.test(file)).sort();
  if (!files.length) throw new Error(`Missing license text: ${pkg.name}`);
  const texts = await Promise.all(files.map(async file => `${file}\n\n${(await readFile(join(path, file), 'utf8')).trim()}`));
  entries.push({ name: `${pkg.name}@${pkg.version}`, text: `${pkg.name}@${pkg.version}\nLicense: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)}\n\n${texts.join('\n\n')}` });
  for (const dependency of Object.keys(pkg.dependencies || {})) pending.push({ parent: path, name: dependency });
}
entries.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(join(root, 'public/licenses/markdown-dependencies.txt'),
  'Markdown viewer dependencies and their transitive dependencies.\nVersions match package-lock.json. Some development-only/type dependencies are\nincluded conservatively. No source modifications were made to these packages.\n\n' + entries.map(entry => `================================================================================\n${entry.text}\n`).join('\n'));
console.log(`Wrote complete license notices for ${entries.length} packages.`);
