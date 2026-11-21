# Digital Darwin v0.1 - actual architecture

## Boundaries

`src/core/engine.ts` depends only on `rng.ts`. Both CLI and the browser module Worker instantiate the same Engine. UI receives observations and sends commands; it has no Engine instance. Canvas drawing, camera state and graph drawing never advance simulation time.

`src/protocol.ts` defines commands and frame DTOs. Worker runs a fixed-tick scheduler targeting 20 TPS at 1x (80/320/640 at higher multipliers, limited by actual compute). Its time budget is 10 ms per timer callback; scheduling debt is bounded. Every executed tick uses identical rules, with no wall-clock delta in biology. Paused step executes exactly one tick. Frames target 10 Hz and use transferable typed position/ID/food buffers, with an acknowledgement to limit in-flight periodic frames. Explicit user commands can force a fresh frame. Selected-agent metadata and up to 300 population samples are copied. Frame epoch resets camera/selection on a new world. Worker exceptions stop playback and surface a visible error. There is no save/restore recovery yet.

Canvas renders the food field and actual organisms. Colors map to inherited speed; size is a rendering choice. Camera pan/zoom does not alter the world. Hit-testing uses current positions; the inspector queries by stable ID. A dead selected organism is identified as dead, without inventing archived genealogy. Graph axes use actual sample ticks and population counts. Sparse samples do not represent every tick.

## World and resources

The default grid is 256×256 with toroidal boundaries. Seeded circular fertility patches are stable across ticks. Each cell stores Int32 food, capacity and regrowth. Capacity is `floor(500 + min(1,fertility)*6500)`, growth is `max(2,floor(fertility*28))` resource quanta/tick. Initial food is 30–100% of capacity. Both food and organism reserve use integer quanta, 1000 quanta per displayed energy unit. Growth is an explicit external energy source, capped by cell capacity. No detritus/nutrients/climate are implemented in DD-00.

## Tick contract

1. Normalize organisms by ascending stable ID; advance tick.
2. Grow food to cell capacity, track energy input.
3. Each live pre-existing organism forms one lifecycle intent using the same food field: compare local food with eight radial sensor samples, orient toward a richer sample or use seeded exploratory turning. If local food is at least 650 quanta, rest; otherwise move at inherited speed. Coordinates wrap at borders.
4. Group agents by destination cell in a spatial claim map. Equal requests are 650 quanta. Each receives `min(650,floor(cellFood/claimants))`; fractional remainder remains in the cell. No first-claimant advantage or double spending. There is no full N² neighbor scan. Radial sensing is an eight-probe approximation, not an exhaustive radius search.
5. Assimilate `floor(portion*efficiency)`, limited by maximum reserve 80000. Food minus assimilation is an external digestive sink; capped overflow is discarded into that sink.
6. Deduct `ceil(70 + 35*velocity² + 4*sensor + 16*efficiency²)` quanta/tick. Basal, movement and sensor costs are explicit. Actual deducted energy is bounded by the reserve; depleted organisms die and are removed before reproduction.
7. At age >=45 and energy >=threshold*1000, create at most one child: investment `floor(reserve*.45)` is subtracted from parent and transferred to child, plus a 1200-quantum dissipative reproduction cost. The child gets fresh ID, parent ID, generation+1, age=0, birth tick and a separate mutated genome.
8. Insert newborns after the action loop. They cannot act until the next tick. Finish counters and audits.

The single action invariant means one composite lifecycle intent (move/feed/metabolize/reproduce), not one of those phases exclusively. Costs are charged once; a newborn gets none of the parent's feeding. Confirmed dead agents cannot act. Organisms have no intrinsic age limit in DD-00; deaths are energy exhaustion.

## Genome and determinism

Four numerical inherited traits: speed [.25,1.8], sensor [1,8], efficiency [.65,1], reproduction threshold [32,64]. Each gene mutates independently at probability .12 per birth by uniform ±8% of its entire range, clamped to bounds. Zero mutation produces an exact value copy in a distinct object. Trait maintenance costs provide basic trade-offs; DD-00 does not establish scientific evidence of natural selection.

RNG is xoshiro128** v1, seed text initialized using FNV-1a and splitmix32. Full 128-bit RNG state is included in canonical state. Stable ID order fixes assignment of random draws and newborn IDs. Equal food allocation is proportional, order independent. JS floating coordinates and trigonometry are retained: reproducibility is claimed only in the measured Node/V8 environment. No cross-engine bit-identity is claimed. Canonical JSON includes engine version, all configuration, food/capacity/growth, tick, RNG, next ID, cumulative births/deaths and all living-agent fields sorted by ID. CLI SHA-256 hashes this complete future-affecting state.

## Storage and scaling decisions

Food fields are typed arrays. Organisms are compact records, IDs monotonically increase and are not reused. Records are adequate for the measured DD-00 scale; a SoA conversion is deferred until profiling warrants it. No archive stores every historical organism. Aggregate history is capped at 300 samples. Main-thread UI receives only render buffers and the selected agent, not thousands of genome objects. Canonical serialization is an explicit CLI check, never per-frame work.

Configuration validation rejects non-finite, non-integer or out-of-range dimensions/population/mutation. Worker validates supported speed, play, inspect and seed commands. This is a same-origin local application, not a hostile plugin protocol. Save schema, replay, request-ID deduplication, module registries and interventions are future work; no placeholder APIs pretend to implement them.

## Verification and toolchain

No runtime dependencies. Node 24 strips erasable TS for headless execution; build emits browser JS with `.ts` imports rewritten to `.js`. The server serves only `dist` on 127.0.0.1 and rejects traversal. Source is intended for strict TypeScript, but compiler availability must be reported separately. Project lint checks syntax/core boundaries/seeded randomness, not all ESLint rules.

Unit tests isolate budgets and lifecycle. Integration tests exercise a real 1000-agent ecology, no-food extinction and batch-size determinism. CLI checks invariants every tick. Playwright runs the compiled application and real Worker through offline file routes because this environment blocks loopback networking. It compares visible counters with captured Worker observations and records real screenshots. Browser transport through the local HTTP server remains an environmental verification gap.
