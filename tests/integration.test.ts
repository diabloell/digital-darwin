import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/core/engine.ts';
test('1000-organism real ecology births, deaths and valid metrics', () => { const e = new Engine({ seed: 'dd00-integration' }); e.step(1000); e.assertValid(); const m = e.metrics(); assert.ok(m.births > 0); assert.ok(m.deaths > 0); assert.equal(m.population, 1000 + m.births - m.deaths); assert.ok(m.maxGeneration > 0); assert.equal(new Set(e.organisms.map(a=>a.id)).size, m.population); });
test('without food or regrowth all energy-dependent organisms die', () => { const e = new Engine({ population: 100, regrowth: false }); e.food.fill(0); e.step(1000); assert.equal(e.organisms.length, 0); assert.equal(e.deaths, 100); assert.equal(e.births, 0); });
test('batch size does not affect deterministic outcome', () => { const a = new Engine({ seed: 'batch', width: 32, height: 32, population: 100 }), b = new Engine({ seed: 'batch', width: 32, height: 32, population: 100 }); a.step(500); for (let i = 0; i < 50; i++) b.step(10); assert.equal(a.canonical(), b.canonical()); });
