// Writes src/synths/vs/suiteModel.json from the local VS program banks.
// Run with npx vite-node tools/vs-suite/buildModel.mjs.
import fs from 'node:fs';
import {programs,buildModel} from './model.mjs';

const list=programs(),model=buildModel(list);
fs.writeFileSync('src/synths/vs/suiteModel.json',JSON.stringify(model));
console.log(list.length,'programs;',Object.entries(model.families).map(([k,v])=>`${k} ${v.programs}`).join(', '));
