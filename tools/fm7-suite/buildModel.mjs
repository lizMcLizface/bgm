// Writes src/synths/dx7/suiteModel.json from the local ROM cartridges.
// Run with npx vite-node tools/fm7-suite/buildModel.mjs.
import fs from 'node:fs';
import {romVoices,buildModel} from './model.mjs';

const voices=romVoices(),model=buildModel(voices);
fs.writeFileSync('src/synths/dx7/suiteModel.json',JSON.stringify(model));
console.log(voices.length,'distinct voices;',Object.entries(model.families).map(([k,v])=>`${k} ${v.voices}`).join(', '));
