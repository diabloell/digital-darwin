# Digital Darwin - engine 0.2 architecture

## Boundaries

`src/core/engine.ts` depends only on `rng.ts`. Both CLI and the browser module Worker instantiate the same Engine. UI receives observations and sends commands; it has no Engine instance. Canvas drawing, camera state and graph drawing never advance simulation time.

`src/protocol.ts` defines commands and frame DTOs. Worker runs a fixed-tick scheduler targeting 20 TPS at 1x (80/320/640 at higher multipliers, limited by actual compute). Its time budget is 10 ms per timer callback; scheduling debt is bounded. Every executed tick uses identical rules, with no wall-clock delta in biology. Paused step executes exactly one tick. Frames target 10 Hz and use transferable typed position/ID/food buffers, with an acknowledgement to limit in-flight periodic frames. Explicit user commands can force a fresh frame. Selected-agent metadata and up to 300 population samples are copied. Frame epoch resets camera/selection on a new world. Worker exceptions stop playback and surface a visible error. There is no save/restore recovery yet.

Canvas renders the food field and actual organisms. Colors map to inherited speed; size is a rendering choice. Camera pan/zoom does not alter the world. Hit-testing uses current positions; the inspector queries by stable ID. A dead selected organism is identified as dead, without inventing archived genealogy. Graph axes use actual sample ticks and population counts. Sparse samples do not represent every tick.

## World and resources

The default grid is 256×256 with toroidal boundaries. Seeded circular fertility patches are stable across ticks. Each cell stores Int32 food, capacity and regrowth. Capacity is `floor(500 + min(1,fertility)*6500)`, growth is `max(2,floor(fertility*28))` resource quanta/tick. Initial food is 30–100% of capacity. Both food and organism reserve use integer quanta, 1000 quanta per displayed energy unit. Growth is an explicit external energy source, capped by cell capacity. No detritus/nutrients/climate are implemented in DD-00.

## Tick contract

1. **Environment.** Advance the tick, normalize organisms by stable ID and apply capped resource growth.
2. **Observations.** All eligible organisms sense the same post-growth food field and their own pre-movement state. Eight radial probes determine the richest direction. Zero-reserve records are excluded.
3. **Intents.** For each observation, decide heading and speed in ID order. Rest if local food is at least 650 quanta. Otherwise forage toward the richest sampled cell or use seeded exploratory turning.
4. **Movement.** Apply each intent once, wrap coordinates, update age and collect one destination claim per actor.
5. **Competition.** Each claimant receives `min(650,floor(cellFood/claimants))`. Consume a cell's allocation once and retain any remainder. ID order controls random draws without giving earlier IDs priority for food.
6. **Metabolism.** Assimilate `floor(portion*efficiency)` up to 80,000 reserve quanta. Record the unassimilated amount and apply `ceil(70 + 35*velocity² + 4*sensor + 16*efficiency²)` energy cost capped at the remaining reserve.
7. **Death.** Remove depleted agents before reproduction.
8. **Reproduction.** For eligible survivors aged at least 45, transfer `floor(reserve*.45)` to one newborn and deduct an additional 1,200 quanta as a sink. Append newborns only after the phase. `reproduction: false` disables this phase's births. The default permits births.
9. **Audit.** Commit counters, check action count, digestive loss and net organism energy. `assertValid()` also independently checks aggregate food, grid bounds, identity, lifecycle, genome and population accounting. The CLI runs the full check every tick by default.

The engine accepts an optional phase-completion observer for profiling. Clocks and hashing are driven by the CLI. Profiling uses the same state transitions as ordinary stepping.

## Genome and determinism

Four numerical inherited traits: speed [.25,1.8], sensor [1,8], efficiency [.65,1], reproduction threshold [32,64]. Each gene mutates independently at probability .12 per birth by uniform ±8% of its entire range, clamped to bounds. Zero mutation produces an exact value copy in a distinct object. Trait maintenance costs provide basic trade-offs; DD-00 does not establish scientific evidence of natural selection.

RNG is xoshiro128** v1, seed text initialized using FNV-1a over UTF-16 code units and splitmix32. Full 128-bit RNG state is included in canonical state. Stable ID order fixes assignment of random draws and newborn IDs. Equal food allocation is proportional, order independent. JS floating coordinates and trigonometry are retained: reproducibility is claimed only in the measured Node/V8 environment. No cross-engine bit-identity is claimed. Canonical JSON includes engine version, all configuration, food/capacity/growth, tick, RNG, next ID, cumulative births/deaths and all living-agent fields sorted by ID. CLI SHA-256 hashes this complete future-affecting state at tick zero, every checkpoint interval and the final tick.

## Storage and scaling decisions

Food fields are typed arrays. Organisms are compact records, IDs monotonically increase and are not reused. Records are adequate for the measured DD-00 scale; a SoA conversion is deferred until profiling warrants it. No archive stores every historical organism. Aggregate history is capped at 300 samples. Main-thread UI receives only render buffers and the selected agent, not thousands of genome objects. Canonical serialization is an explicit CLI check, never per-frame work.

Configuration validation rejects non-finite, non-integer or out-of-range dimensions/population/mutation. Worker validates supported speed, play, inspect and seed commands. This is a same-origin local application, not a hostile plugin protocol. Save schema, replay, request-ID deduplication, module registries and interventions are future work; no placeholder APIs pretend to implement them.

## Verification and toolchain

No runtime dependencies. Node 24 runs erasable TypeScript for the CLI and tests. The build emits browser JavaScript with imports rewritten to `.js`. Separately, the pinned TypeScript compiler checks the application, worker, core, CLI and tests in strict mode with `tsc --noEmit`. `npm ci` installs the locked development dependencies. The project lint checks syntax, core boundaries and seeded randomness.

The loopback HTTP server serves the build for ordinary startup and browser verification. Playwright measures movement and playback speed, compares visible counters and inspector values with real Worker messages, and records screenshots. Unit tests exercise energy budgets and lifecycle. Integration tests cover births, deaths, no-food extinction and batch-size determinism. The CLI checks invariants every tick and hashes complete canonical state. The PR workflow runs these checks and uploads the resulting evidence.

## DD-02 genetic observation

Engine 0.3 adds versioned genome and expressed phenotype in `src/core/genetics.ts`. Observation, movement, feeding and birth thresholds use phenotypes. Reproduction still debits the parent, and assimilation maintenance enters the ordinary energy sink. The default selection model adds a quadratic assimilation cost. `dd01` restores the earlier cost, and `neutral` expresses common traits while retaining heritable genotype variation. The statistical observer uses only current population and latest lifecycle events. The browser receives bounded genetic samples without changing Worker commands or existing frame coordinate layout. See [metrics](docs/genetic-metrics.md) and [ADR-003](docs/adr/003-dd02-evolution-rules.md).

## DD-03 observer

The settings form sends an explicit typed create command. Worker construction validates it through Engine and replaces the current world only after success. Frames carry world dimensions, generation buffers, and trait histograms. Normal running frames are spaced by at least 100 ms and use acknowledgments. Paused worlds send frames in response to commands. Chart histories retain up to 300 samples.

Canvas sizes change on ResizeObserver. The landscape image is updated once per observed tick and reused during camera motion. The map batches visible organisms by color band and coalesces redraws into requestAnimationFrame. The trail contains up to 32 observed positions. The simulation and existing headless interfaces still use the same core and rules. [Observer controls](docs/observer.md)
