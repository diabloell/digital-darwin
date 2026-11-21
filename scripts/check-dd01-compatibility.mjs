import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Engine } from '../src/core/engine.ts';

const fixture = JSON.parse(await readFile('reports/dd-01/long-run-a.json', 'utf8'));
const engine = new Engine({ ...fixture.config, rule: 'dd01' });
engine.step(fixture.ticks);
engine.assertValid();
const state = JSON.parse(engine.canonical());
state.version = '0.2.0';
delete state.genomeVersion;
delete state.evolutionVersion;
delete state.config.rule;
delete state.config.resourceScale;
delete state.config.mutationStrength;
const hash = createHash('sha256').update(JSON.stringify(state)).digest('hex');
assert.equal(hash, fixture.hash);
console.log(`DD-01 compatibility PASS at tick ${fixture.ticks}: ${hash}`);
