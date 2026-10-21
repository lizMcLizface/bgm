// Compare synthesized drum hits with private local WAV targets. No reference audio
// is loaded into the synthesis engine or copied into a public build.
// npx vite-node tools/auditDrumReference.mjs cases.json [--kernel old.wasm] [--out dir]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {SYNTHS} from '../src/synths/models.js';
import {KITS} from '../src/synths/drums/kits.js';
import {createOfflineSynth} from '../src/synths/engine/offline.js';
import {readWav} from '../src/synths/wav.js';
import {compareReferences} from '../src/synths/engine/referenceMetrics.js';

const args=process.argv.slice(2),option=key=>{const i=args.indexOf(key);return i<0?null:args[i+1];};
if(!args[0])throw Error('Usage: npx vite-node tools/auditDrumReference.mjs cases.json [--kernel old.wasm] [--out dir]');
const file=path.resolve(args[0]),base=path.dirname(file),manifest=JSON.parse(fs.readFileSync(file,'utf8'));
if(typeof manifest.source!=='string'||!Array.isArray(manifest.cases)||!manifest.cases.length)throw Error('Provide source and cases in the manifest.');
const kernelFile=path.resolve(option('--kernel')??'public/synths/classics.wasm'),kernel=fs.readFileSync(kernelFile),module=new WebAssembly.Module(kernel);
const out=path.resolve(option('--out')??'.tmp/drum-reference-report');fs.mkdirSync(out,{recursive:true});
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function envelopeStats(channels,sr){
 const hop=Math.round(sr*.005),count=Math.floor(channels[0].length/hop),env=[];
 for(let b=0;b<count;b++){let power=0;for(const c of channels)for(let i=b*hop;i<(b+1)*hop;i++)power+=c[i]**2;env.push(Math.sqrt(power/(hop*channels.length)));}
 const peak=Math.max(...env);let last=-1;env.forEach((v,i)=>{if(v>=peak*.1)last=i;});
 const energy=(from,to)=>{let e=0;for(const c of channels)for(let i=Math.round(from*sr);i<Math.min(c.length,Math.round(to*sr));i++)e+=c[i]**2;return e;};
 return {t20Seconds:peak>1e-9?(last+.5)*hop/sr:null,t20Truncated:last===count-1,
  lateToAttackDb:10*Math.log10(Math.max(1e-30,energy(.1,.35))/Math.max(1e-30,energy(0,.1))),
  hopSeconds:hop/sr,envelopeDb:env.map(v=>20*Math.log10(Math.max(1e-9,v/Math.max(1e-30,peak))))};
}
function wav(channels,sr){
 const frames=channels[0].length,n=channels.length,bytes=Buffer.alloc(44+frames*n*4);
 bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(3,20);bytes.writeUInt16LE(n,22);bytes.writeUInt32LE(sr,24);bytes.writeUInt32LE(sr*n*4,28);bytes.writeUInt16LE(n*4,32);bytes.writeUInt16LE(32,34);bytes.write('data',36);bytes.writeUInt32LE(frames*n*4,40);
 for(let i=0;i<frames;i++)for(let c=0;c<n;c++)bytes.writeFloatLE(channels[c][i],44+(i*n+c)*4);return bytes;
}
const results=[];
for(const [index,c]of manifest.cases.entries()){
 const kit=KITS[c.model],synth=SYNTHS[c.model],track=kit?.tracks.findIndex(t=>t[0]===c.track);
 if(!kit||track<0)throw Error(`Unknown drum ${c.model}/${c.track}`);
 const referenceFile=path.resolve(base,c.reference),referenceBytes=fs.readFileSync(referenceFile),decoded=readWav(referenceBytes),sr=decoded.sampleRate;
 if(sr<8000||sr>192000)throw Error('Reference rate must be 8..192 kHz.');
 const start=c.startSeconds??0,seconds=c.seconds??decoded.samples.length/sr-start;
 if(!Number.isFinite(start)||start<0||!Number.isFinite(seconds)||seconds<.1||seconds>10)throw Error('Invalid reference interval.');
 const from=Math.round(start*sr),frames=Math.round(seconds*sr);if(from+frames>decoded.samples.length)throw Error(`Reference interval exceeds ${c.reference}`);
 for(const [k,v]of Object.entries(c.values??{}))if(!Object.hasOwn(synth.params.BY_KEY,k)||typeof v!=='number'||!Number.isFinite(v)||synth.params.clampValue(k,v)!==v)throw Error(`Invalid parameter ${k}`);
 const values=synth.params.sanitize({chorusMix:0,reverbMix:0,kickBody:0,...c.values}),engine=createOfflineSynth(module,{model:kit.model,sampleRate:sr,params:synth.params.toPairs(values)});
 engine.k.syn_note_on(1,36+track,1);const candidate=engine.render(frames),reference=decoded.channels.map(a=>a.subarray(from,from+frames));
 const comparison=compareReferences(reference,candidate,sr),name=`${index+1}-${c.model}-${c.track}`;
 fs.writeFileSync(path.join(out,name+'.wav'),wav(candidate,sr));
 results.push({name,model:c.model,track:c.track,referenceFile,referenceSha256:sha(referenceBytes),startSeconds:start,seconds,sampleRate:sr,values,
  referenceEnvelope:envelopeStats(reference,sr),candidateEnvelope:envelopeStats(candidate,sr),comparison});
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({source:manifest.source,kernelFile,kernelSha256:sha(kernel),
 limitations:['These are comparison targets, not proof of component-level hardware accuracy.','Recording level is separate from normalized decay and spectral shape.','Overlapping voices, effects and unverified knob positions must be recorded in the case source.'],results},null,2));
console.table(results.map(r=>({model:r.model,track:r.track,targetT20:r.referenceEnvelope.t20Seconds,candidateT20:r.candidateEnvelope.t20Seconds,targetLateDb:r.referenceEnvelope.lateToAttackDb.toFixed(2),candidateLateDb:r.candidateEnvelope.lateToAttackDb.toFixed(2)})));
console.log(`Private comparison report and synthesized WAVs: ${out}`);
