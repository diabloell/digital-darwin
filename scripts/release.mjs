import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, root } from './build.mjs';

export const VERSION='0.1.0-rc.1';
export async function packageRelease(output) {
  const files=await build();
  const target=path.resolve(output,'digital-darwin-'+VERSION);
  await mkdir(target,{recursive:true});
  const expected=new Set();
  async function copy(relative, source){
    expected.add(relative.split(path.sep).join('/'));
    const destination=path.join(target,relative);
    await mkdir(path.dirname(destination),{recursive:true});
    await copyFile(source,destination);
  }
  // Explicit build inputs keep stale output files out of the package.
  for (const file of files) await copy(path.relative(root,file),file);
  await copy('start.mjs',path.join(root,'scripts/local-server.mjs'));
  await copy('START.md',path.join(root,'docs/release/START.md'));
  await copy('RELEASE-NOTES.md',path.join(root,'docs/release/RELEASE-NOTES.md'));
  const contents=[];
  async function manifest(dir=''){
    for(const item of await readdir(path.join(target,dir),{withFileTypes:true})){
      const name=path.posix.join(dir,item.name);
      if(item.isDirectory())await manifest(name);
      else if(name!=='SHA256SUMS'){
        if(!expected.has(name))throw Error('Unexpected file in release directory: '+name);
        const bytes=await readFile(path.join(target,name));
        contents.push([name,createHash('sha256').update(bytes).digest('hex')]);
      }
    }
  }
  await manifest();
  const sha=contents.sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,digest])=>digest+'  '+name).join('\n')+'\n';
  await writeFile(path.join(target,'SHA256SUMS'),sha);
  console.log('Release package:',target);
  return {target,manifest:sha};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  await packageRelease(process.argv[2]||'outputs/release');
