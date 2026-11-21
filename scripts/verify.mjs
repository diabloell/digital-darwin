import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
await mkdir('reports', { recursive: true });
const commands = [
  ['build',['scripts/build.mjs']], ['typecheck',['scripts/typecheck.mjs']], ['lint',['scripts/lint.mjs']],
  ['unit',['--test','tests/unit.test.ts']], ['integration',['--test','tests/integration.test.ts']],
  ['long-run-a',['apps/cli.ts','--seed','dd00-verification','--ticks','5000','--population','1000','--output','reports/long-run-a.json']],
  ['long-run-b',['apps/cli.ts','--seed','dd00-verification','--ticks','5000','--population','1000','--output','reports/long-run-b.json']],
  ['performance-5000',['apps/cli.ts','--seed','dd00-performance','--ticks','1000','--population','5000','--output','reports/performance-5000.json']],
  ['e2e',['scripts/e2e.mjs']]
];
const checks = [];
for (const [name,args] of commands) {
  const r = spawnSync(process.execPath, args, { encoding:'utf8',maxBuffer:20*1024*1024 });
  await writeFile(`reports/${name}.log`, (r.stdout ?? '') + (r.stderr ?? '') + (r.error ? '\n'+String(r.error) : ''));
  const status = r.status === 0 ? 'PASS' : name === 'typecheck' && r.status === 2 ? 'NOT RUN' : 'FAIL';
  checks.push({name,command:'node '+args.join(' '),status,exitCode:r.status}); console.log(`${name}: ${status}`);
}
const a = JSON.parse(await readFile('reports/long-run-a.json','utf8')), b = JSON.parse(await readFile('reports/long-run-b.json','utf8'));
checks.push({name:'determinism',command:'compare SHA-256 of canonical states from long-run-a and long-run-b',status:a.hash === b.hash ? 'PASS':'FAIL',hashA:a.hash,hashB:b.hash});
await writeFile('reports/checks.json',JSON.stringify(checks,null,2));
await import('./report.mjs');
if (checks.some(c=>c.status === 'FAIL')) process.exitCode = 1;
