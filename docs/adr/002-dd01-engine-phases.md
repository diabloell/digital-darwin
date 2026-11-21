# ADR-002: DD-01 fixed tick phases and state checkpoints

Engine 0.2.0 separates observations, intents and resource allocation, then completes metabolism, death, reproduction and audit. Sorting by entity ID preserves the order of random draws and allocation of child IDs. Equal food grants preserve the existing unbiased integer rule. Seeded full-state SHA-256 checkpoints and phase timing live in the CLI. The browser continues to use the same fixed-tick Engine and Worker protocol.

The previous seed hash iterated Unicode code points but read only the first UTF-16 unit of each point. For example, 🌱 and 🌲 emitted the same random sequence because their UTF-16 leading surrogate matches. Hashing both units repairs the collision. BMP seed inputs retain their prior initialization. Canonical hashes also change across versions because the engine version and resolved reproduction flag are serialized. Reproduction is enabled by default. State hashes are verification evidence, with no supported DD-00 snapshot import format.

Phase boundaries and integer accounting provide observability without adding runtime libraries, renderer dependencies or a second simulation. Existing step, metrics and CLI entry points remain available. The optional phase observer receives a phase name after each phase. It is intended for synchronous instrumentation that leaves engine state untouched.
