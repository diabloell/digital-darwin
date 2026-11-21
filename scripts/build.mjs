import { stripTypeScriptTypes } from 'node:module';
import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function build() {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(rel);
      else if (/\.(ts|css)$/.test(rel)) {
        const target = path.join(root, 'dist', rel.replace(/\.ts$/, '.js'));
        await mkdir(path.dirname(target), { recursive: true });
        if (rel.endsWith('.ts')) { const code = stripTypeScriptTypes(await readFile(path.join(root, rel), 'utf8'), { mode: 'strip' }).replace(/(from\s+['"][^'"]+)\.ts(['"])/g, '$1.js$2'); await writeFile(target, code); }
        else await copyFile(path.join(root, rel), target);
        files.push(target);
      }
    }
  }
  await mkdir(path.join(root, 'dist'), { recursive: true }); await walk('src');
  await copyFile(path.join(root, 'index.html'), path.join(root, 'dist/index.html'));
  console.log(`BUILD PASS: ${files.length + 1} files emitted to dist/`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
