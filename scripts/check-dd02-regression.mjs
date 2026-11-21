import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const files = [process.argv[2], 'reports/dd-02/experiments.json'];
const [current, reference] = await Promise.all(files.map(path => readFile(path)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(current), hash(reference));
const result = JSON.parse(current);
assert.equal(result.runs.length, 20);
console.log(`DD-02 regression PASS: ${result.runs.length} replicas × ${result.ticks} ticks; ${hash(current)}`);
