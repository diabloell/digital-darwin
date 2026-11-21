import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [a, b] = await Promise.all(process.argv.slice(2).map(async file => JSON.parse(await readFile(file, 'utf8'))));
assert.deepEqual(a.config, b.config);
assert.equal(a.ticks, 5000);
assert.equal(b.ticks, a.ticks);
assert.equal(a.final.tick, a.ticks);
assert.equal(b.final.tick, b.ticks);
assert.deepEqual(a.errors, []);
assert.deepEqual(b.errors, []);
assert.match(a.hash, /^[0-9a-f]{64}$/);
assert.equal(a.hash, b.hash);
console.log(`DETERMINISM PASS: ${a.hash}`);
