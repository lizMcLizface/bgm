import { pianoBuffer, pianoBodyBuffer,renderPiano,renderPianoBody, clearPianoCache } from './piano';
import { pianoBufferLater, resetPianoPool } from './pianoRenderPool';
import fs from 'node:fs';
import * as rustPiano from './rustPiano';
import {writePianoPreparation,pianoPreparationStats,resetPianoPreparationStats,PIANO_PREPARATION_KEY} from './pianoPreparation';

const context = { sampleRate: 8000, createBuffer: (channels, length) => { const data = new Float32Array(length); return { length, getChannelData: () => data }; } };
const options = { type: 'felt', decay: 0.4, velocity: 0.6, seed: 3 };

// workers answer a tick later, as real ones do
class FakeWorker {
    static made = []; static jobs = [];
    constructor() { FakeWorker.made.push(this); }
    postMessage({ id, sampleRate, freq, settings }) {
        FakeWorker.jobs.push(freq);
        setTimeout(() => this.onmessage({ data: { id, samples: renderPiano(sampleRate, freq, settings) } }), 1);
    }
}

beforeEach(() => {localStorage.removeItem(PIANO_PREPARATION_KEY);resetPianoPreparationStats();FakeWorker.made = []; FakeWorker.jobs = []; globalThis.Worker = FakeWorker; clearPianoCache(); resetPianoPool(); });
afterEach(() => {delete globalThis.Worker;localStorage.removeItem(PIANO_PREPARATION_KEY);vi.restoreAllMocks();});

test('a note not rendered yet is rendered on a worker and then found in the cache', async () => {
    const later = pianoBufferLater(context, 261.63, options);
    expect(later).toBeInstanceOf(Promise);
    await later;
    expect(FakeWorker.jobs).toEqual([261.63]);
    expect(pianoBufferLater(context, 261.63, options)).toBeNull();
    expect(pianoBuffer(context, 261.63, options).length).toBeGreaterThan(0);
    expect(FakeWorker.jobs).toHaveLength(1);
});

test('a chord is rendered on several workers at once, and the same note asked twice is rendered once', async () => {
    const chord = [261.63, 329.63, 392, 523.25].map((f) => pianoBufferLater(context, f, options));
    const again = pianoBufferLater(context, 261.63, options);
    expect(again).toBe(chord[0]);
    expect(FakeWorker.made.length).toBeGreaterThan(1);
    await Promise.all(chord);
    expect(FakeWorker.jobs.sort()).toEqual([261.63, 329.63, 392, 523.25]);
});

test('without workers the caller renders on the spot', () => {
    delete globalThis.Worker; resetPianoPool();
    expect(pianoBufferLater(context, 261.63, options)).toBeNull();
});

const wasm=new WebAssembly.Module(fs.readFileSync('public/piano-preparation/piano.wasm'));
class RustWorker{
 postMessage({id,sampleRate,freq,bodyFrequency,settings,renderer}){setTimeout(()=>{const r=rustPiano.createRustPiano(wasm);try{this.onmessage({data:{id,renderer,version:'test-wasm',samples:renderer==='rust'?r.renderNote(sampleRate,freq,settings):renderPiano(sampleRate,freq,settings),...(renderer==='rust'&&rustPiano.supportsRustPianoBody(settings)?{body:r.renderBody(sampleRate,bodyFrequency,{...settings,sustain:settings.sustain??0})}:{})}});}finally{r.dispose();}},1);}
}
test('renderer namespaces prevent legacy cache reuse and prepare the Rust held body at the unrounded pitch',async()=>{
 const c={...context,createBuffer:(_,length)=>{const data=new Float32Array(length);return {length,getChannelData:()=>data};}},opts={...options,type:'electric',sustain:.28,resonance:.6},freq=1200.004;
 const legacy=pianoBuffer(c,freq,opts);writePianoPreparation('rust');globalThis.Worker=RustWorker;resetPianoPool();await pianoBufferLater(c,freq,opts);const rust=pianoBuffer(c,freq,opts);expect(rust).not.toBe(legacy);let max=0;for(let i=0;i<rust.length;i++)max=Math.max(max,Math.abs(rust.getChannelData()[i]-legacy.getChannelData()[i]));expect(max).toBeLessThan(1e-6);
 const body=pianoBodyBuffer(c,freq,opts).getChannelData(),expected=renderPianoBody(c.sampleRate,freq,{...opts,velocity:4/7});let delta=0;for(let i=0;i<body.length;i++)delta=Math.max(delta,Math.abs(body[i]-expected[i]));expect(delta).toBeLessThan(1e-7);expect(pianoPreparationStats()).toMatchObject({rustNotes:1,rustBodies:1,fallbacks:0,version:'test-wasm'});expect(pianoBufferLater(c,freq,opts)).toBeNull();writePianoPreparation('legacy');expect(pianoBuffer(c,freq,opts)).toBe(legacy);
});
test('a Rust worker failure caches the actual original note and reports one explicit fallback',async()=>{
 class BrokenWorker{postMessage(){setTimeout(()=>this.onmessage({data:{error:'piano Wasm unavailable'}}),1);}}
 writePianoPreparation('rust');globalThis.Worker=BrokenWorker;resetPianoPool();await pianoBufferLater(context,220,options);pianoBuffer(context,220,options);expect(pianoPreparationStats()).toMatchObject({rustNotes:0,fallbacks:1,lastError:'Error: piano Wasm unavailable'});expect(pianoBufferLater(context,220,options)).toBeNull();
});
test('Rust preparation without Workers still prepares asynchronously and owns its output',async()=>{
 delete globalThis.Worker;resetPianoPool();writePianoPreparation('rust');const r=rustPiano.createRustPiano(wasm);vi.spyOn(rustPiano,'loadRustPiano').mockResolvedValue({renderer:r,version:'main-test'});try{const later=pianoBufferLater(context,220,options);expect(later).toBeInstanceOf(Promise);await later;expect(r.activeHandles).toBe(0);expect(pianoPreparationStats()).toMatchObject({rustNotes:1,rustBodies:1,fallbacks:0,version:'main-test'});}finally{r.dispose();}
});
test('a matched acoustic model stays on its original renderer under the Rust policy',async()=>{
 writePianoPreparation('rust');await pianoBufferLater(context,220,{...options,type:'ambient'});expect(pianoPreparationStats()).toMatchObject({requested:'rust',rustNotes:0,legacyNotes:1,unsupported:1,fallbacks:0});
});

test('the actual felted acoustic family uses Rust strikes without inventing a looping modal body',async()=>{
 writePianoPreparation('rust');globalThis.Worker=RustWorker;resetPianoPool();await pianoBufferLater(context,261.63,{...options,type:'felted',resonance:.55,wear:.1});expect(pianoPreparationStats()).toMatchObject({rustNotes:1,rustBodies:0,legacyNotes:0,unsupported:0,fallbacks:0});expect(pianoBufferLater(context,261.63,{...options,type:'felted',resonance:.55,wear:.1})).toBeNull();
});
test('failed original-worker jobs are not counted as prepared notes before the synchronous fallback',async()=>{
 class BrokenWorker{postMessage(){setTimeout(()=>this.onmessage({data:{error:'worker stopped'}}),1);}}globalThis.Worker=BrokenWorker;resetPianoPool();await pianoBufferLater(context,220,options);expect(pianoPreparationStats()).toMatchObject({legacyNotes:0,fallbacks:1});pianoBuffer(context,220,options);expect(pianoPreparationStats()).toMatchObject({legacyNotes:1,fallbacks:1});
});
test('changing policy during preparation does not relabel an older original-renderer job',async()=>{
 const pending=pianoBufferLater(context,220,options);writePianoPreparation('rust');await pending;expect(pianoPreparationStats()).toMatchObject({legacyNotes:1,rustNotes:0,unsupported:0,fallbacks:0});
});
