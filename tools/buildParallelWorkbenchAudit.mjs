import {build} from 'esbuild';
import fs from 'node:fs/promises';
await fs.access('dist/index.html');
await fs.mkdir('dist/tools',{recursive:true});
await build({entryPoints:['tools/parallelWorkbenchAudit.js'],outfile:'dist/tools/parallel-workbench-audit.js',bundle:true,format:'esm',define:{'import.meta.env.BASE_URL':'"/"'}});
await fs.writeFile('dist/tools/parallelWorkbenchAudit.html',(await fs.readFile('tools/parallelWorkbenchAudit.html','utf8')).replace('./parallelWorkbenchAudit.js','./parallel-workbench-audit.js'));
console.log('Parallel audio audit ready at /tools/parallelWorkbenchAudit.html.');
