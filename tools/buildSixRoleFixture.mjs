import fs from 'node:fs';
import {makeSixRoleFixture,validateSixFixture} from '../src/modular-audio/sixRoleFixture.js';
const file='public/modular-audio/six-role-fixture.json',text=JSON.stringify(validateSixFixture(makeSixRoleFixture()),null,2)+'\n';
if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Six-role fixture stale: run npm.cmd run ensemble:fixture then graph:build');console.log('Pinned six-role score/patch fixture matches its authoring sources.');}
else{fs.mkdirSync('public/modular-audio',{recursive:true});fs.writeFileSync(file,text);console.log(`Wrote ${Buffer.byteLength(text)} byte six-role fixture.`);}
