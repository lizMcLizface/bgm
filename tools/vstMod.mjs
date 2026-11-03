// Modulation calibration: how deep and how fast the plugin's LFO / PWM moves pitch, level or brightness, against ours.
//   npm run vst:mod -- tools/vst/cases/<spec>.json [--run name]
// Spec: {pair, note, hold, base:{vst:{...},ours:{...}}, tests:[{name, series:"pitchCents|levelDb|centroidOct", mode:"depth|rate",
//   vstParam, norms:[...], vst:{extra}, ours:{extra}, oursKey, oursValues:[...]}]}
// depth tests: our value that gives the plugin's depth at each knob position (interpolated); rate tests: the plugin's measured Hz per knob.
import fs from 'node:fs';
import path from 'node:path';
import {PAIRS} from './vst/pairs.mjs';
import {ROOT,runHost,loadWav,renderOurs} from './vst/lib.mjs';
import {modulationProfile} from './vst/modulation.mjs';

const file=path.resolve(process.argv[2]),spec=JSON.parse(fs.readFileSync(file,'utf8')),pair=PAIRS[spec.pair];
const run=process.argv.includes('--run')?process.argv[process.argv.indexOf('--run')+1]:path.basename(file,'.json');
const note=spec.note??60,hold=spec.hold??2.5,tail=.3,velocity=100,[from,to]=spec.window??[.3,hold-.1];
const dir=path.join(ROOT,'.tmp/vst-match',run);
const cases=[];
for(const t of spec.tests)for(const n of t.norms)cases.push({name:`${t.name}@${n}`,params:{...spec.base.vst,...t.vst,[t.vstParam]:{norm:n}},notes:[{note,velocity,start:0,duration:hold}],seconds:hold+tail});
const result=runHost({sampleRate:48000,plugins:{[pair.plugin]:{cases}}},dir)[pair.plugin];
const fmt=(x,d=2)=>x==null||!Number.isFinite(x)?'   -':x.toFixed(d).padStart(7);
const interp=(xs,ys,y)=>{ // x (ascending) whose y (monotone-ish) equals the target; linear between neighbours
 for(let i=1;i<xs.length;i++){const a=ys[i-1],b=ys[i];if((a<=y&&y<=b)||(b<=y&&y<=a))return b===a?xs[i]:xs[i-1]+(xs[i]-xs[i-1])*(y-a)/(b-a);}
 return y<Math.min(...ys)?NaN:NaN;};
const out=[];
for(const t of spec.tests){
 const measure=ch=>modulationProfile(ch,48000,note,{from:Math.round(from*48000),to:Math.round(to*48000),...(spec.frames??{})})[t.series];
 const vstRows=t.norms.map(n=>({knob:n,...measure(loadWav(result[`${t.name}@${n}`].wav).channels)}));
 console.log(`\n## ${t.name} (${t.series}, ${t.mode})`);
 if(t.mode==='rate'){
  console.log('knob    rate Hz  depth   share');
  for(const r of vstRows)console.log(String(r.knob).padEnd(6),fmt(r.rateHz),fmt(r.depth),fmt(r.share));
  out.push({test:t.name,vst:vstRows});
  continue;
 }
 const oursRows=t.oursValues.map(v=>{const o=renderOurs(pair.model,{...spec.base.ours,...t.ours,[t.oursKey]:v},{note,velocity,hold,tail});return {value:v,...measure(o)};});
 const xs=oursRows.map(r=>r.value),ys=oursRows.map(r=>r.depth);
 console.log('VST knob   depth   rate Hz  ->  ours '+t.oursKey);
 for(const r of vstRows)console.log(String(r.knob).padEnd(8),fmt(r.depth),fmt(r.rateHz),'     ',fmt(interp(xs,ys,r.depth),3));
 console.log('ours '+t.oursKey+':  '+oursRows.map(r=>`${r.value}=${r.depth.toFixed(2)}`).join('  ')+`   (rate ${oursRows.map(r=>r.rateHz.toFixed(1)).join('/')} Hz)`);
 out.push({test:t.name,vst:vstRows,ours:oursRows});
}
fs.writeFileSync(path.join(dir,'modulation.json'),JSON.stringify(out,null,1));
console.log(`\nFiles: ${dir}`);
