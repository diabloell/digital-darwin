# ADR-005 — Versioned snapshots and transactional saves

Engine and PopulationHistory expose data snapshots and restore their internal state without spawning organisms or advancing the generator. A snapshot request copies a completed tick synchronously in the Worker. Serialization and hashing run on the copy. After parsing and schema validation, restore constructs a candidate engine and history, verifies their invariants, then publishes a new paused epoch. Request IDs handle supersession, frame epochs guard stale UI updates, and current-world replacement happens after validation.

IndexedDB stores each slot in one record with a unique label. The record combines immutable snapshot metadata and JSON with a slot revision. Compare-and-swap and the unique index protect concurrent edits across tabs. UI status waits for transaction completion. Rename changes the slot's display label. Import validates the full file in the Worker before offering a confirmation; restore revalidates it. Versions require exact compatibility and use schema 1; migration will need a dedicated transformer and fixture.

Checksums cover exact UTF-8 payload bytes and ordered manifest values. All object shapes and critical numeric limits are checked explicitly before construction. Critical invariants cover IDs, RNG state, arrays, gene bounds, historical cross-links and sample limits. A checksum can be computed by anyone, so files remain untrusted. User names and seed values are shown as text.

Payloads are JSON without lossy conversion or external storage. A 32 MiB import limit bounds reads. Snapshot creation temporarily copies arrays and retained genealogy. Save performance is measured separately from tick throughput. Viewport state is reset on restore and limited observer samples survive.
