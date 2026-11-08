// Run after the local production build, then open /tools/driveAudit.html
// on its preview server. This audit page is never part of a public build.
import {build} from 'esbuild';
import fs from 'node:fs/promises';
await fs.access('dist/index.html');
await build({entryPoints:['tools/driveAudit.js'],outfile:'dist/tools/drive-audit.js',bundle:true,format:'esm'});
await fs.writeFile('dist/tools/driveAudit.html',(await fs.readFile('tools/driveAudit.html','utf8')).replace('./driveAudit.js','./drive-audit.js'));
console.log('Native pedal audit ready at /tools/driveAudit.html on the local preview server.');
