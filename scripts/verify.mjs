import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const output = process.env.DD_EVIDENCE_DIR || 'outputs/verification';
await mkdir(output, { recursive: true });
const simulation = (file, seed, ticks, population, ...options) => [
  'apps/cli.ts', '--seed', seed, '--ticks', ticks, '--population', population, '--output', `${output}/${file}.json`, ...options
];
const commands = [
  ['typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['build', ['scripts/build.mjs']],
  ['lint', ['scripts/lint.mjs']],
  ['unit', ['--test', 'tests/unit.test.ts']],
  ['integration', ['--test', 'tests/integration.test.ts']],
  ['long-run-a', simulation('long-run-a', 'dd00-verification', '10000', '1000')],
  ['long-run-b', simulation('long-run-b', 'dd00-verification', '10000', '1000')],
  ['performance-5000', simulation('performance-5000', 'dd00-performance', '1000', '5000', '--profile')],
  ['no-food', simulation('no-food', 'dd01-starvation', '600', '1000', '--width', '32', '--height', '32', '--no-food')],
  ['no-reproduction', simulation('no-reproduction', 'dd01-control', '1000', '1000', '--width', '32', '--height', '32', '--no-reproduction')],
  ['e2e', ['scripts/e2e.mjs']],
  ['determinism', ['scripts/check-determinism.mjs', `${output}/long-run-a.json`, `${output}/long-run-b.json`, '10000']]
];
const checks = [];
for (const [name, args] of commands) {
  const command = 'node ' + args.map(arg => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(' ');
  if (name === 'determinism' && !['long-run-a', 'long-run-b'].every(run => checks.some(check => check.name === run && check.status === 'PASS'))) {
    checks.push({ name, command, status: 'NOT RUN', exitCode: null });
    console.log(`${name}: NOT RUN (requires two successful runs)`);
    continue;
  }
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, DD_EVIDENCE_DIR: output }
  });
  await writeFile(`${output}/${name}.log`, (result.stdout ?? '') + (result.stderr ?? '') + (result.error ? '\n' + String(result.error) : ''));
  const status = result.status === 0 ? 'PASS' : 'FAIL';
  checks.push({ name, command, status, exitCode: result.status });
  console.log(`${name}: ${status} (${command})`);
}
await writeFile(`${output}/checks.json`, JSON.stringify(checks, null, 2) + '\n');
if (checks.some(check => check.status !== 'PASS')) process.exitCode = 1;
