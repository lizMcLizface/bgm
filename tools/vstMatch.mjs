// Match our synth engines against the installed VST3 synths. See docs/VST_MATCHING.md.
//   npm run vst:match -- twin dx7 [--programs 0,3,7|all] [--note 60] [--velocity 100] [--hold 1] [--tail 1.5]
//   npm run vst:match -- cases tools/vst/cases/<file>.json [--fit] [--only name,name]
//   npm run vst:match -- params <plugin> [filter]      parameter table of a plugin
// Reports and both renders go to .tmp/vst-match/<run>/ (vst/ and ours/ wavs, report.json, report.md).
import fs from 'node:fs';
import path from 'node:path';
import {PAIRS} from './vst/pairs.mjs';
import {SYNTHS} from '../src/synths/models.js';
import {ROOT,runHost,loadWav,renderOurs,trimTo,measure,cost,fit,writeWav,catalog} from './vst/lib.mjs';

const [cmd,target,...rest]=process.argv.slice(2);
const flag=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i<0?fallback:process.argv[i+1]??true;};
const fmt=(x,d=1)=>x==null?'   -':(x>=0?' ':'')+x.toFixed(d);
const SR=48000;

function report(rows,dir,title){
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(rows,null,1));
 const head='| case | gain dB | pitch ct | env dB | spec dB | harm dB | rel env | worst harmonics (ours-vst dB) or bands |\n|---|---|---|---|---|---|---|---|\n';
 const worst=r=>r.bandDiff.filter(b=>Math.max(b.vst,b.ours)>-45).sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff)).slice(0,3).map(b=>`${b.hz}Hz ${fmt(b.diff)}`).join(', ');
 const lines=rows.map(r=>{const m=r.metrics;return `| ${r.name} | ${fmt(m.full.gainDb)} | ${fmt(m.full.pitchCents,0)} | ${fmt(m.full.envDb)} | ${fmt(m.full.specDb)} | ${fmt(m.harm?.rms)} | ${fmt(m.release?.envDb)} | ${m.harm?m.harm.worst.map(w=>`h${w.h} ${fmt(w.diff)}`).join(', '):worst(m)} |`;});
 fs.writeFileSync(path.join(dir,'report.md'),`# ${title}\n\ngain = level our synth needs to match the VST (negative = ours is louder). env/spec are RMS errors after that one gain.\n\n${head}${lines.join('\n')}\n`);
 console.log(`\n${title}\n`+head+lines.join('\n'));
 const ok=rows.filter(r=>r.metrics.full.gainDb!=null);
 if(ok.length){const mean=f=>ok.reduce((s,r)=>s+(f(r.metrics)??0),0)/ok.length;
  console.log(`\nmean: gain ${fmt(mean(m=>m.full.gainDb))} dB, |pitch| ${fmt(mean(m=>Math.abs(m.full.pitchCents??0)),0)} ct, env ${fmt(mean(m=>m.full.envDb))} dB, spec ${fmt(mean(m=>m.full.specDb))} dB`);}
 console.log(`\nFiles: ${dir}`);
}

function compareCase({name,pair,vstWav,values,note,velocity,hold,tail,dir,fitKeys,window}){
 const ref=loadWav(vstWav),sr=ref.sampleRate,frames=Math.round((hold+tail)*sr);
 const reference=trimTo(ref.channels,frames);
 let fitted=null;
 if(fitKeys?.length){fitted=fit(pair.model,values,fitKeys,reference,sr,note,{hold,tail,velocity,window});values={...values,...fitted.values};}
 const ours=renderOurs(pair.model,values,{note,velocity,hold,tail,sampleRate:sr});
 writeWav(path.join(dir,'ours',name+'.wav'),ours,sr);
 return {name,metrics:measure(reference,ours,sr,{hold,tail,note}),values,fit:fitted&&{cost:fitted.cost,history:fitted.history,keys:fitKeys}};
}

if(cmd==='params'){
 const c=catalog(PAIRS[target]?.plugin??target),re=new RegExp(rest[0]??'.','i');
 for(const [k,p] of Object.entries(c))if(re.test(k))console.log(k.padEnd(28),String(p.min).padStart(8),String(p.max).padStart(8),String(p.norm.toFixed(3)).padStart(7),p.label??'',p.values&&p.values.length<=40?p.values.join('|'):'');
}else if(cmd==='twin'){
 const pair=PAIRS[target];if(!pair?.fromVst)throw Error('twin needs a pair with an exact patch mapping: '+Object.keys(PAIRS).filter(k=>PAIRS[k].fromVst).join(', '));
 const programs=catalog(pair.plugin).program.values,pick=flag('programs','all');
 const chosen=pick==='all'?programs.map((_,i)=>i):String(pick).split(',').map(Number);
 const note=+flag('note',60),velocity=+flag('velocity',100),hold=+flag('hold',1),tail=+flag('tail',1.5);
 const dir=path.join(ROOT,'.tmp/vst-match',flag('run',target+'-twin'));
 const names=chosen.map(i=>`${String(i).padStart(2,'0')} ${programs[i].trim().replace(/[^\w+-]+/g,'_')}`);
 const job={sampleRate:SR,plugins:{[pair.plugin]:{cases:chosen.map((i,k)=>({name:names[k],program:programs[i],params:pair.lockPhase,readback:true,notes:[{note,velocity,start:0,duration:hold}],seconds:hold+tail}))}}};
 const result=runHost(job,dir)[pair.plugin];
 const rows=names.map(name=>compareCase({name,pair,vstWav:result[name].wav,values:{...pair.fromVst(result[name].values),...pair.lockOurs},note,velocity,hold,tail,dir,fitKeys:null}));
 report(rows,dir,`${target} twin: ${pair.plugin} programs vs ours, note ${note} vel ${velocity}`);
}else if(cmd==='cases'){
 const file=path.resolve(target),spec=JSON.parse(fs.readFileSync(file,'utf8')),pair=PAIRS[spec.pair];if(!pair)throw Error('Unknown pair '+spec.pair);
 const only=flag('only',null)?.split(','),wantFit=!!flag('fit',false);
 // A sweep steps one VST knob through `norms` (0..1) over a base patch; with --fit our `fit` params follow it,
 // so the fitted values read as that knob's response curve in our units.
 const sweeps=(spec.sweeps??[]).flatMap(w=>w.norms.map(n=>({...w,name:`${w.name}@${n}`,vst:{...w.vst,params:{...w.vst?.params,[w.vstParam]:{norm:n}}},sweep:undefined})));
 const cases=[...spec.cases??[],...sweeps].filter(c=>!only||only.some(o=>c.name.startsWith(o))).map(c=>({...spec.defaults,...c}));
 const byPlugin={};
 for(const c of cases){
  const plugin=c.plugin??pair.plugin,hold=c.hold??1,tail=c.tail??1.5;
  (byPlugin[plugin]??={cases:[]}).cases.push({name:c.name,program:c.vst?.program??null,params:c.vst?.params??(pair.toVst&&pair.toVst(SYNTHS[pair.model].params.sanitize({...pair.lockOurs,...c.ours}))),notes:[{note:c.note??60,velocity:c.velocity??100,start:0,duration:hold}],seconds:hold+tail});
 }
 const dir=path.join(ROOT,'.tmp/vst-match',flag('run',path.basename(file,'.json')));
 const result=runHost({sampleRate:SR,plugins:byPlugin},dir);
 const rows=cases.map(c=>compareCase({name:c.name,pair,vstWav:result[c.plugin??pair.plugin][c.name].wav,values:c.ours??{},note:c.note??60,velocity:c.velocity??100,hold:c.hold??1,tail:c.tail??1.5,dir,fitKeys:wantFit?c.fit:null,window:c.window}));
 report(rows,dir,`${spec.pair}: ${path.basename(file)}`);
 for(const r of rows)if(r.fit)console.log(`fit ${r.name}: cost ${r.fit.history.map(h=>h.cost.toFixed(2)).join(' → ')}  ${r.fit.keys.map(k=>`${k}=${(+r.values[k]).toPrecision(4)}`).join(' ')}`);
}else{
 console.log('Usage: vst:match -- twin <pair> | cases <file.json> [--fit] | params <plugin> [regex]\nPairs: '+Object.keys(PAIRS).join(', '));
 process.exit(1);
}
