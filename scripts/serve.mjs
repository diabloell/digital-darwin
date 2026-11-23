import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, root } from './build.mjs';
import { startStaticServer } from './local-server.mjs';

export async function startServer(port) {
  await build();
  return startStaticServer(port,path.join(root,'dist'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startServer(Number(process.env.PORT || 5173));
  console.log(`Digital Darwin: http://127.0.0.1:${server.address().port} (local only)`);
}
