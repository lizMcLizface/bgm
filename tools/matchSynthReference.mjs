// Controlled single-note A/B measurement. No recordings or imported banks are
// bundled. Run with vite-node because the model registry uses Vite imports.
// npm run audit:synth-reference -- path/to/local-case.json [--out directory]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {SYNTHS} from '../src/synths/models.js';
import {createOfflineSynth} from '../src/synths/engine/offline.js';
import {readWav} from '../src/synths/wav.js';
import {composeWaves} from '../src/synths/vs/waves.js';
import {compareReferences} from '../src/synths/engine/referenceMetrics.js';

const args=process.argv.slice(2);
if(!args[0]||args.includes('--help')){
 console.log('Usage: npm run audit:synth-reference -- case.json [--out directory]\nSee docs/SYNTHS_MATCHING.md for the manifest and measurement limits.');
 process.exit(args.includes('--help')?0:1);
}
const manifest=path.resolve(args[0]),base=path.dirname(manifest),spec=JSON.parse(fs.readFileSync(manifest,'utf8'));
const model=SYNTHS[spec.model];
if(!model||model.kit||!Number.isInteger(model.model))throw Error('Choose a melodic classics-kernel model from src/synths/models.js.');
const number=(key,lo,hi)=>{const v=spec[key];if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)throw Error(`${key} must be a number in ${lo}..${hi}.`);return v;};
const note=number('note',0,127),velocity=number('velocity',0,1),hold=number('holdSeconds',.001,60),tail=number('tailSeconds',0,60);
const referenceStart=number('referenceStartSeconds',0,3600);
if(hold+tail>60)throw Error('Keep a reference case at or below 60 seconds.');
if(typeof spec.reference!=='string'||!spec.reference)throw Error('A reference WAV path is required.');
if(typeof spec.source!=='string'||!spec.source.trim())throw Error('Record the reference source in source.');
if(!spec.values||typeof spec.values!=='object'||Array.isArray(spec.values))throw Error('Provide the decoded patch in values.');
for(const [key,value] of Object.entries(spec.values)){
 if(!model.params.BY_KEY[key]||typeof value!=='number'||!Number.isFinite(value)||model.params.clampValue(key,value)!==value)throw Error(`Unknown or out-of-range parameter: ${key} = ${value}`);
}
const values=model.params.sanitize(spec.values),referenceFile=path.resolve(base,spec.reference),referenceBytes=fs.readFileSync(referenceFile),wav=readWav(referenceBytes);
const sampleRate=wav.sampleRate;
if(sampleRate<8000||sampleRate>192000)throw Error('Reference sample rate must be 8..192 kHz.');
const heldFrames=Math.round(hold*sampleRate),tailFrames=Math.round(tail*sampleRate),frames=heldFrames+tailFrames,start=Math.round(referenceStart*sampleRate);
if(start+frames>wav.samples.length)throw Error('The reference WAV does not cover referenceStartSeconds + holdSeconds + tailSeconds.');
const waveSpec=spec.waves??{},waves=spec.model==='vs'?composeWaves({
 wavs:(waveSpec.wavs??[]).map(w=>({first:w.first,bytes:fs.readFileSync(path.resolve(base,w.file))})),
 userDump:waveSpec.userDump?fs.readFileSync(path.resolve(base,waveSpec.userDump)):null,
}):null;
const kernel=fs.readFileSync(new URL('../public/synths/classics.wasm',import.meta.url));
const synth=createOfflineSynth(new WebAssembly.Module(kernel),{model:model.model,sampleRate,params:model.params.toPairs(values),waves});
synth.k.syn_note_on(1,note,velocity);
const held=synth.render(heldFrames);synth.k.syn_note_off(1);
const released=synth.render(tailFrames),candidate=held.map((c,i)=>{const out=new Float32Array(frames);out.set(c);out.set(released[i],heldFrames);return out;});
const reference=wav.channels.map(c=>c.subarray(start,start+frames));
const warnings=[
 'These measurements describe a recording comparison, not proof of hardware accuracy. No overall pass/fail score is assigned.',
 'Timing uses the explicit referenceStartSeconds. No automatic time alignment or parameter fitting is performed.',
 'Pitch estimation is intended for periodic single notes; inspect spectra for octave errors, noise, modulation or chords.',
];
if(spec.patchVerified!==true)warnings.push('Reference patch settings are not verified. Use this as a listening target; do not infer physical parameter ranges from the match.');
if(values.reverbMix||values.chorusMix)warnings.push('Shared chorus/reverb is enabled. Match effects explicitly or disable them for source/filter calibration.');
if(spec.model==='vs'&&!waveSpec.wavs?.length)warnings.push('VS is using built-in substitute ROM waves. Supply the original wave WAVs for factory-program matching.');
const slice=(channels,from,to)=>channels.map(c=>c.subarray(from,to));
const segments={full:compareReferences(reference,candidate,sampleRate)};
if(heldFrames>=sampleRate*.1)segments.heldEnd=compareReferences(slice(reference,Math.max(0,heldFrames-Math.round(.3*sampleRate)),heldFrames),slice(candidate,Math.max(0,heldFrames-Math.round(.3*sampleRate)),heldFrames),sampleRate);
if(tailFrames)segments.release=compareReferences(slice(reference,heldFrames,frames),slice(candidate,heldFrames,frames),sampleRate);
const report={schema:1,model:spec.model,source:spec.source,patchVerified:spec.patchVerified===true,
 referenceSha256:crypto.createHash('sha256').update(referenceBytes).digest('hex'),
 kernelSha256:crypto.createHash('sha256').update(kernel).digest('hex'),
 wavesSha256:waves?crypto.createHash('sha256').update(Buffer.from(waves.buffer,waves.byteOffset,waves.byteLength)).digest('hex'):null,
 sampleRate,note,velocity,holdSeconds:hold,tailSeconds:tail,referenceStartSeconds:referenceStart,values,warnings,segments};
const outAt=args.indexOf('--out'),out=path.resolve(outAt<0?'.tmp/synth-matching/'+path.basename(manifest,'.json'):args[outAt+1]);
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
// Stereo PCM export for listening: preserve original gain, not metric normalization.
const bytes=Buffer.alloc(44+frames*4);bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(sampleRate,24);bytes.writeUInt32LE(sampleRate*4,28);bytes.writeUInt16LE(4,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*4,40);
for(let i=0;i<frames;i++)for(let c=0;c<2;c++)bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,candidate[c][i]))*32767),44+i*4+c*2);
fs.writeFileSync(path.join(out,'candidate.wav'),bytes);
console.table(Object.entries(segments).map(([segment,r])=>({segment,gainToMatchDb:r.gainToMatchDb,pitchErrorCents:r.pitchErrorCents,envelopeErrorDb:r.envelopeErrorDb,spectralShapeErrorDb:r.spectralShapeErrorDb})));
for(const warning of warnings)console.log(warning);
console.log(`Report and candidate.wav: ${out}`);
