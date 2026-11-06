// @vitest-environment node
import {readFileSync} from 'node:fs';
import {ZPLANE_SHAPES,ZPLANE_SHAPE_NAMES} from './zplaneShapes';
import {RACK_PARAMS,RACK_PRESETS,cleanRack,rackPackets} from './params';
import {UNITS,maskFromUnits} from './order';
import {zplaneSections,zplaneResponse} from './zplaneMath';
import {unitsUsedBy} from './rackParts';

// the worklet file is plain script: run it with the audio globals stubbed and keep the processor class it registers
const SR=48000;
function loadProcessor(){
 let Processor;
 new Function('AudioWorkletProcessor','registerProcessor','sampleRate',readFileSync('public/rack-fx-processor.js','utf8'))(
  class{constructor(){this.port={};}},(name,cls)=>{if(name==='rack-zplane')Processor=cls;},SR);
 return Processor;
}
// steady-state gain (dB) of the filter for a sine at `hz`
function gainAt(P,hz,{a=0,b=2,morph=0,shift=0,q=.5}={}){
 const node=new P({processorOptions:{shapes:ZPLANE_SHAPES}}),n=128,total=SR/2;
 const params={a:[a],b:[b],morph:[morph],shift:[shift],q:[q],mix:[1]};
 let inE=0,outE=0;
 for(let start=0;start<total;start+=n){
  const input=new Float32Array(n).map((_,i)=>Math.sin(2*Math.PI*hz*(start+i)/SR)),out=new Float32Array(n);
  node.process([[input,input]],[[out,new Float32Array(n)]],params);
  if(start>total/2){for(let i=0;i<n;i++){inE+=input[i]**2;outE+=out[i]**2;}}
 }
 return 10*Math.log10(outE/inE);
}

test('every shape has six sections and the rack knows their names',()=>{
 expect(ZPLANE_SHAPES.every(s=>s.sections.length===6)).toBe(true);
 expect(RACK_PARAMS.BY_KEY['zplane.a'].max).toBe(ZPLANE_SHAPE_NAMES.length-1);
});

test('a vowel shape peaks at its first formant and the level stays near unity',()=>{
 const P=loadProcessor(),ah=[200,650,1080,3000,8000].map(f=>gainAt(P,f,{a:0,b:0}));
 expect(ah[1]).toBeGreaterThan(ah[0]+6);   // the 650 Hz formant stands well above 200 Hz
 expect(ah[1]).toBeGreaterThan(ah[4]+6);
 expect(Math.max(...ah)).toBeLessThan(18);
 expect(ah.every(Number.isFinite)).toBe(true);
});

test('morphing moves the peak from one vowel to the other and shift moves it with the frequency',()=>{
 const P=loadProcessor();
 // Ee has its first formant at 290 Hz and Ah at 650 Hz: halfway the peak sits in between
 const at=(hz,morph)=>gainAt(P,hz,{a:0,b:2,morph});
 expect(at(650,0)).toBeGreaterThan(at(290,0));
 expect(at(290,1)).toBeGreaterThan(at(650,1));
 const up=gainAt(P,1300,{a:0,b:0,shift:1}),flat=gainAt(P,1300,{a:0,b:0});
 expect(up).toBeGreaterThan(flat+3);
});

test('the notch shape cuts, and the filter stays stable on loud noise at extreme settings',()=>{
 const P=loadProcessor();
 expect(gainAt(P,1100,{a:6,b:6})).toBeLessThan(gainAt(P,700,{a:6,b:6})-3);
 const node=new P({processorOptions:{shapes:ZPLANE_SHAPES}});
 let peak=0;
 for(let k=0;k<2000;k++){
  const input=new Float32Array(128).map(()=>Math.random()*2-1),out=new Float32Array(128);
  node.process([[input,input]],[[out,new Float32Array(128)]],{a:[k%12],b:[(k*5)%12],morph:[(k%7)/6],shift:[Math.sin(k)],q:[1],mix:[1]});
  for(const v of out)peak=Math.max(peak,Math.abs(v));
 }
 expect(Number.isFinite(peak)).toBe(true);expect(peak).toBeLessThan(200);
});

test('the unit is a tail unit of the rack and runs only when added and mixed in',()=>{
 expect(UNITS).toContain('zplane');
 expect(rackPackets(cleanRack()).extras.zplane.on).toBe(false);
 const on=rackPackets({...cleanRack(),'master.chain':maskFromUnits(['zplane'])}).extras.zplane;
 expect(on.on).toBe(true);expect(on.morph).toBe(0);
});

test('the z-plane presets bring the unit into the chain',()=>{
 for(const name of ['Talking pad','Vowel choir','Wah sweep','Hollow room'])
  expect(unitsUsedBy(RACK_PRESETS.find(p=>p.name===name).values)).toContain('zplane');
});

test("the display's response agrees with what the worklet does", () => {
    const P = loadProcessor();
    for (const [a, b, morph, shift, q] of [[0, 2, 0.5, 0, 0.5], [6, 9, 0.3, 0.4, 0.8]]) {
        const freqs = [150, 500, 1000, 2500, 6000], shown = zplaneResponse(zplaneSections(a, b, morph, shift, q), freqs);
        freqs.forEach((hz, i) => expect(Math.abs(gainAt(P, hz, { a, b, morph, shift, q }) - shown[i])).toBeLessThan(1.2));
    }
});
