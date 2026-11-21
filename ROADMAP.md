# Milestone roadmap

| Stage | Scope | Current status |
| --- | --- | --- |
| DD-00 | First working living simulation, map, controls, inspector, tests, CLI | Implemented; see reports/latest.json for actual gate result |
| DD-01 | Strengthen deterministic engine contracts, regression fixtures, runtime/toolchain validation and diagnostics | Await customer acceptance; first resolve DD-00 typecheck/toolchain gap |
| DD-02 | Measured inheritance/selection experiments and biological model refinement | Not started |
| DD-03 | Observer UX, layers and performance polish | Not started |
| DD-04 | Genealogy and aggregate event history | Not started |
| DD-05 | Versioned saves, restore and replay | Not started |
| DD-06 | Paired experiments and analysis | Not started |
| DD-07 | Predators and food chains | Not started |
| DD-08 | Climate, seasons and biomes | Not started |
| DD-09 | Social signaling experiments | Not started |
| DD-10 | Measured large-population scaling | Not started |
| DD-11 | Release hardening | Not started |
| DD-12 | Independent audit | Not started |

These are scopes, not delivery-date promises. Notion source plans are under docs/spec. Do not start another stage without the customer's review. Before a DD-00 PASS, run strict typecheck in a dependency-enabled environment and confirm normal HTTP browser launch; migrating the recommended renderer/UI stack is a separate decision, not a prerequisite to running this dependency-free slice.
