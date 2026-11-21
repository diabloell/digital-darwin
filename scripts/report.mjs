import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const json = async name => JSON.parse(await readFile(`reports/${name}.json`,'utf8'));
const checks = await json('checks'), a = await json('long-run-a'), b = await json('long-run-b'), perf = await json('performance-5000'), e2e = await json('e2e');
const unitLog = await readFile('reports/unit.log','utf8'), integrationLog = await readFile('reports/integration.log','utf8');
const counts = text => ({passed:Number(text.match(/(?:ℹ\s*)?pass\s+(\d+)/)?.[1] ?? text.match(/# pass (\d+)/)?.[1] ?? 0),failed:Number(text.match(/(?:ℹ\s*)?fail\s+(\d+)/)?.[1] ?? text.match(/# fail (\d+)/)?.[1] ?? 0)});
const unit = counts(unitLog), integration = counts(integrationLog);
const gitHead = spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});
const sourceCommit = process.env.DD_SOURCE_COMMIT || (gitHead.status === 0 ? gitHead.stdout.trim() : 'NOT CREATED: local .git/index.lock write denied; see reports/publication.json for GitHub commit');
const status = checks.some(c=>c.status === 'FAIL') || e2e.status === 'FAIL' ? 'FAIL' : checks.some(c=>c.status === 'NOT RUN') ? 'PARTIAL' : 'PASS';
const c = name => { const x=checks.find(c=>c.name===name); return `${x?.status ?? 'NOT RUN'} | ${x?.command ?? 'no command'}`; };
const limitations = ['Strict typecheck NOT RUN: tsc and @types/node absent; npm registry DNS unavailable. strict tsconfig is present but build only strips types.', 'Recommended React/Vite/PixiJS/Vitest/pnpm replaced by dependency-free DOM/Canvas/Node test adapters; see docs/adr/001-dd00.md.', 'Browser E2E uses real dist files and real Worker through offline Playwright routes. Direct loopback HTTP navigation is denied by the sandbox; normal TCP browser launch not verified here.', 'Determinism verified only in Node '+a.environment.node+' on Windows x64; cross-browser bit identity not established.', 'Performance includes invariant checks and natural population changes, not fixed-population throughput, browser FPS or a long-term stability guarantee.', 'DD-01+ features, saves, predators, climate, full lineage archives and experiment lab are intentionally not implemented.'];
const paths = ['reports/build.log','reports/typecheck.log','reports/lint.log','reports/unit.log','reports/integration.log','reports/e2e.json','reports/e2e.log','reports/e2e-loopback-denied.log','reports/long-run-a.json','reports/long-run-b.json','reports/performance-5000.json','reports/initial-model-extinction.json','reports/screenshot-1366x768.png','reports/screenshot-1920x1080.png','reports/screenshot-mobile.png','reports/checks.json','docs/spec/','docs/adr/001-dd00.md'];
const report = `DIGITAL DARWIN - MILESTONE REPORT

STAGE: DD-00
STATUS: ${status}

COMMIT: ${sourceCommit} (GitHub source baseline; report/artifact commit follows; see reports/publication.json for GitHub branch/commit)
BUILD: ${c('build')} | actual browser JS emitted to dist
TYPECHECK: ${c('typecheck')} | compiler unavailable; exit 2; not counted as PASS
LINT: ${c('lint')} | project syntax/core-boundary guard, not ESLint
UNIT: ${c('unit')} | ${unit.passed} successful, ${unit.failed} unsuccessful
INTEGRATION: ${c('integration')} | ${integration.passed} successful, ${integration.failed} unsuccessful
E2E: ${c('e2e')} | ${e2e.checks?.length ?? 0} user-path checks; Chrome ${e2e.browser ?? 'unknown'}; actual Worker; offline file routes
LONG_RUN: ${c('long-run-a')} | seed=${a.seed}; ticks=${a.ticks}; population=${a.initial.population}->${a.final.population}; births=${a.final.births}; deaths=${a.final.deaths}; maxGeneration=${a.final.maxGeneration}; errors=${a.errors.length}
PERFORMANCE: ${c('performance-5000')} | ${perf.tps.toFixed(2)} TPS incl. invariant checks; seed=${perf.seed}; ${perf.ticks} ticks; population=${perf.initial.population}->${perf.final.population}; p50=${perf.tickP50Ms.toFixed(3)} ms, p95=${perf.tickP95Ms.toFixed(3)} ms (step only); Node ${perf.environment.node}, ${perf.environment.platform}/${perf.environment.arch}, ${perf.environment.cpu.trim()}, ${perf.environment.logicalCpus} logical CPUs, end RSS=${(perf.environment.memoryBytes/1048576).toFixed(1)} MiB. 1k-start long run: ${a.tps.toFixed(2)} TPS, 1000->${a.final.population}.
DETERMINISM: ${a.hash===b.hash?'PASS':'FAIL'} | two commands: node apps/cli.ts --seed dd00-verification --ticks 5000 --population 1000 --output reports/long-run-a.json AND node apps/cli.ts --seed dd00-verification --ticks 5000 --population 1000 --output reports/long-run-b.json; both 256x256, mutationRate=.12, regrowth=true, engine=${a.engineVersion}; SHA-256 A=${a.hash}; B=${b.hash}; equal=${a.hash===b.hash}

WHAT_CHANGED:
- Implemented autonomous 256x256 toroidal ecology with 1000 founders, real food search/consumption, movement, integer energy budgets, starvation, energy-transfer reproduction, four inherited mutable genes, unique IDs and deferred newborn actions.
- Independent TypeScript core shared by headless CLI and module Worker. Bounded observation history, typed transfer buffers and rendering-independent fixed ticks.
- Russian laboratory UI: interactive resource map, actual organisms, pan/zoom, play/pause/step, speed, tick/population/food/birth/death metrics, population graph, new seed, organism energy/age/genome inspector and responsive layouts.
- Read and saved main Notion specification, plan and all six child specifications in docs/spec. Added README, agent rules, architecture, roadmap and ADR.
- Preserved initial ecological failure evidence: first model 1000->0 at 5000 ticks, 117 births / 1117 deaths. Rest-for-feeding and increased explicit regrowth produce the current garden balance. No claim that every seed is stable or that evolution has been scientifically demonstrated.
- Target repository verified through GitHub connector with push permission; shell Git transport fails DNS. Changes prepared separately from main.
- Start locally: node scripts/serve.mjs ; open http://127.0.0.1:5173 . No package installation needed.

EVIDENCE:
${paths.map(p=>'- '+p).join('\n')}

LIMITATIONS:
${limitations.map(p=>'- '+p).join('\n')}

BREAKING_CHANGES:
- No prior application existed; remote main contained only its heading README. No saves or public APIs are declared stable in DD-00.

BLOCKERS:
- DD-00 PASS is blocked by unavailable strict TypeScript compiler/dependency installation. Confirm ordinary browser HTTP launch in an unrestricted local environment. No required biological test is failing.

NEXT_RECOMMENDED_STAGE: DD-01

END MILESTONE REPORT
`;
await writeFile('reports/DD-00.md',report);
await writeFile('reports/latest.json',JSON.stringify({stage:'DD-00',status,sourceCommit,checks,unit,integration,e2e,longRun:{seed:a.seed,ticks:a.ticks,initialPopulation:a.initial.population,finalPopulation:a.final.population,births:a.final.births,deaths:a.final.deaths,maxGeneration:a.final.maxGeneration,errors:a.errors},determinism:{status:a.hash===b.hash?'PASS':'FAIL',hashAlgorithm:'SHA-256 canonical complete engine state',hashA:a.hash,hashB:b.hash,parameters:a.config,ticks:a.ticks},performance:{tps:perf.tps,initialPopulation:perf.initial.population,finalPopulation:perf.final.population,ticks:perf.ticks,tickP50Ms:perf.tickP50Ms,tickP95Ms:perf.tickP95Ms,environment:perf.environment,includesPerTickInvariantChecks:true},evidence:paths,limitations,blockers:['Strict typecheck unavailable','Direct HTTP browser transport not verified due sandbox loopback restriction'],nextRecommendedStage:'DD-01',nextStageAuthorized:false},null,2));
console.log(`Report saved: ${status}`);
