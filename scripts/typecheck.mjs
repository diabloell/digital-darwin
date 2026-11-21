import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const local = 'node_modules/typescript/bin/tsc';
if (!existsSync(local)) { console.log('TYPECHECK NOT RUN: TypeScript compiler and @types/node unavailable; npm registry DNS unavailable in original environment. strict tsconfig exists, type stripping is not typechecking.'); process.exit(2); }
const r = spawnSync(process.execPath, [local, '--noEmit'], { stdio:'inherit' });
process.exit(r.status ?? 1);
