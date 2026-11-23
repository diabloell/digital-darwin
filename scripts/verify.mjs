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
  ['dd01-compatibility', ['scripts/check-dd01-compatibility.mjs']],
  ['experiments', ['apps/experiments.ts', `${output}/experiments.json`]],
  ['e2e', ['scripts/e2e.mjs']],
  ['lineage-e2e', ['scripts/lineage-e2e.mjs']],
  ["replay", ["scripts/replay.mjs"]],
  ["persistence-e2e", ["scripts/persistence-e2e.mjs"]],
  ["save-benchmark", ["scripts/save-benchmark.mjs"]],
  ["lab-batches", ["apps/lab.ts", "all", `${output}/lab-batches`]],
  ["lab-e2e", ["scripts/lab-e2e.mjs"]],
  ["lab-stress", ["scripts/lab-stress.mjs"]],
  ['browser-benchmark', ['scripts/browser-benchmark.mjs']],
  ['history-benchmark', ['scripts/history-benchmark.mjs']],
  ['dd02-regression', ['scripts/check-dd02-regression.mjs', `${output}/experiments.json`]],
  ['dd02-state', ['scripts/check-determinism.mjs', `${output}/long-run-a.json`, 'reports/dd-02/long-run-a.json', '10000']],
  ['welcome-e2e', ['scripts/welcome-e2e.mjs']],
  ['release-smoke', ['scripts/release-smoke.mjs']],
  ['release-e2e', ['scripts/release-e2e.mjs']],
  ['ecology-smoke', ['scripts/ecology-smoke.mjs']],
  ['ecology-e2e', ['scripts/ecology-e2e.mjs']],
  ['tree-smoke', ['scripts/tree-smoke.mjs']],
  ['tree-e2e', ['scripts/tree-e2e.mjs']],
  ['planet-smoke', ['scripts/planet-smoke.mjs']],
  ['planet-e2e', ['scripts/planet-e2e.mjs']],
  ['game-replay', ['scripts/game-replay.mjs']],
  ['game-e2e', ['scripts/game-e2e.mjs']],
  ['determinism', ['scripts/check-determinism.mjs', `${output}/long-run-a.json`, `${output}/long-run-b.json`, '10000']]
];
const dependencies = { determinism: ['long-run-a', 'long-run-b'], 'dd02-regression': ['experiments'], 'dd02-state': ['long-run-a'] };
const groups = {
  browser: ['e2e','lineage-e2e','persistence-e2e','save-benchmark','browser-benchmark'],
  stress: ['lab-stress'],
  game: ['game-replay'],
  planet: ['planet-smoke','planet-e2e'],
  tree: ['tree-smoke','tree-e2e'],
  ecology: ['ecology-smoke','ecology-e2e'],
  release: ['release-smoke','release-e2e'],
  welcome: ['welcome-e2e']
};
const group = process.env.DD_VERIFY_GROUP;
const labScenario = /^LAB-E0[1-4]$/.test(group ?? '');
const labViewport = /^lab-(1920|1366|390)$/.exec(group ?? '');
const gameViewport = /^game-(1920|1366|390)$/.exec(group ?? '');
if (group && group !== 'core' && !labScenario && !labViewport && !gameViewport && !Object.hasOwn(groups,group)) throw Error('Unknown verification group');
const selected = group === 'core' ? commands.filter(([name])=>!Object.values(groups).flat().includes(name) && !['lab-batches','lab-e2e','game-e2e'].includes(name))
  : labScenario ? [['lab-batches', ['apps/lab.ts', group, `${output}/lab-batches`]]]
  : labViewport ? [['lab-e2e',['scripts/lab-e2e.mjs',labViewport[1]]]]
  : gameViewport ? [['game-e2e',['scripts/game-e2e.mjs',gameViewport[1]]]]
  : group ? commands.filter(([name])=>groups[group].includes(name)) : commands;
const checks = [];
for (const [name, args] of selected) {
  const command = 'node ' + args.map(arg => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(' ');
  if ((dependencies[name] ?? []).some(run => !checks.some(check => check.name === run && check.status === 'PASS'))) {
    checks.push({ name, command, status: 'NOT RUN', exitCode: null });
    console.log(`${name}: NOT RUN (dependency failed)`);
    continue;
  }
  const result = spawnSync(process.execPath, args, {
    timeout: name==='lab-e2e' ? 90000 : undefined,
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
