import {build} from 'esbuild';
import fs from 'node:fs/promises';
await fs.access('dist/index.html');
await build({entryPoints:['tools/stereoMonitorAudit.js'],outfile:'dist/tools/stereo-monitor-audit.js',bundle:true,format:'esm',define:{'import.meta.env.BASE_URL':'"/"'}});
await fs.writeFile('dist/tools/stereoMonitorAudit.html',(await fs.readFile('tools/stereoMonitorAudit.html','utf8')).replace('./stereoMonitorAudit.js','./stereo-monitor-audit.js'));
console.log('Stereo monitor audit ready at /tools/stereoMonitorAudit.html on the local preview server.');
