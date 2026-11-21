# Digital Darwin - agent operating rules

Read README.md, ARCHITECTURE.md, docs/adr/001-dd00.md, ROADMAP.md and reports/latest.json before editing. Reference specs are in docs/spec; later-stage requirements there are not permission to start those stages.

Work autonomously on the requested milestone only. The user is a customer, not a programming student. Stop after the milestone report. DD-01 is not authorized by DD-00.

Keep src/core independent of DOM, React, renderers, clocks, network and storage. All randomness comes from the seeded RNG. Preserve stable entity IDs, canonical iteration, integer resource/energy budgets, one lifecycle intent per live entity per tick, deferred newborn insertion and dead-agent exclusion. Never substitute visual random walks for simulation.

Do not silently change seeded behavior: document model changes, retain evidence, rerun determinism and energy/invariant tests. Any new mechanic needs an actual effect and regression checks. Do not claim real-world biological proof.

Use minimal modules. Do not add microservices, cloud services, paid APIs or speculative infrastructure. Do not deploy publicly or modify data outside the project. Do not delete unrelated files or overwrite main. Never expose credentials.

Run build, lint, unit/integration tests, browser smoke where available, and the representative headless run after engine changes. A type-stripping build is not a strict typecheck. If dependencies or network are unavailable, report NOT RUN and keep the milestone PARTIAL where appropriate. Do not hide failed tests or relax assertions to achieve a pass.

Update architecture, roadmap, milestone ADR and latest report. Preserve historical milestone reports. Cite exact commands, real counts, seeds, state hashes, environments and artifact paths. Reports must use the customer's MILESTONE REPORT format. Performance numbers describe the measured trajectory, not constant-population capacity or browser FPS.

No additional agents are required for DD-00. Keep source, docs and generated verification evidence reviewable in one branch.
