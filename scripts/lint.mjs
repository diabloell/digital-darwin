import { readdir, readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
let count = 0;
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) await walk(p);
    else if (/\.(ts|mjs)$/.test(p)) {
      const text = await readFile(p, 'utf8');
      if (p.endsWith('.ts')) stripTypeScriptTypes(text, { mode: 'strip' });
      if (dir.startsWith('src/core') && /Math\.random\s*\(|\b(?:document|window|Date\.now)\b/.test(text)) throw Error(`Core boundary violation: ${p}`);
      if (p !== 'scripts/lint.mjs' && /\b(?:TODO|FIXME)\b/.test(text)) throw Error(`Unfinished implementation: ${p}`);
      count++;
    }
  }
}
for (const dir of ['src', 'apps', 'scripts', 'tests']) await walk(dir);
console.log(`LINT PASS: ${count} files; TS syntax, core boundaries, seeded randomness, unfinished-code guard. This is a project guard, not ESLint or typecheck.`);
