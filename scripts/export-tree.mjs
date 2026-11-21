// Connector upload helper: emit one explicit group of project UTF-8 files.
import { readdir, readFile } from 'node:fs/promises';
const mode = process.argv[2] || 'source', entries = [];
const groups = mode === 'source' ? ['src','apps','scripts','tests'] : mode === 'docs' ? ['docs'] : ['reports'];
async function walk(dir) { for (const e of await readdir(dir,{withFileTypes:true})) { const p = dir+'/'+e.name; if (e.isDirectory()) await walk(p); else if (/\.(ts|mjs|md|css|json|log)$/.test(p) && p !== 'reports/publication.json') entries.push({path:p,mode:'100644',type:'blob',content:await readFile(p,'utf8')}); } }
for (const group of groups) await walk(group);
if (mode === 'source') for (const p of ['package.json','tsconfig.json','.gitignore','index.html','README.md','AGENTS.md','ARCHITECTURE.md','ROADMAP.md']) entries.push({path:p,mode:'100644',type:'blob',content:await readFile(p,'utf8')});
console.log(JSON.stringify(entries));
