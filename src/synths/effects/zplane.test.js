// @vitest-environment node
import {readFileSync} from 'node:fs';
import {ZPLANE_SHAPES,ZPLANE_SHAPE_NAMES,ZPLANE_CUSTOM,FLAT_ROWS,customRows,shapeRows,cleanNodes,padNodes,insertNode,dropNode,resizeNodes,nodesOf,sortRows} from './zplaneShapes';
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
function gainAt(P,hz,{a=0,b=2,morph=0,shift=0,q=.5,custom=null}={}){
 const node=new P({processorOptions:{shapes:ZPLANE_SHAPES}}),n=128,total=SR/2;
 if(custom)node.port.onmessage({data:{custom}});
 const params={a:[a],b:[b],morph:[morph],shift:[shift],q:[q],mix:[1]};
 let inE=0,outE=0;
 for(let start=0;start<total;start+=n){
  const input=new Float32Array(n).map((_,i)=>Math.sin(2*Math.PI*hz*(start+i)/SR)),out=new Float32Array(n);
  node.process([[input,input]],[[out,new Float32Array(n)]],params);
  if(start>total/2){for(let i=0;i<n;i++){inE+=input[i]**2;outE+=out[i]**2;}}
 }
 return 10*Math.log10(outE/inE);
}

test('every shape has twelve sections (the unused ones neutral) and the rack knows their names',()=>{
 expect(ZPLANE_SHAPES.every(s=>s.sections.length===12 && s.sections.filter(r=>r[2]!==0).length<=6)).toBe(true);
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

test('a custom shape is the last stop, its numbers are rack parameters, and the worklet and the display agree on it',()=>{
 expect(ZPLANE_SHAPE_NAMES[ZPLANE_CUSTOM]).toBe('Custom');
 expect(RACK_PARAMS.BY_KEY['zplane.a'].max).toBe(ZPLANE_CUSTOM);
 const rack=cleanRack(),get=k=>rack['zplane.'+k];
 expect(customRows(get,'a')).toEqual(FLAT_ROWS);
 expect(shapeRows(ZPLANE_CUSTOM,'b',get)).toEqual(FLAT_ROWS);
 expect(shapeRows(0,'a',get)).toBe(ZPLANE_SHAPES[0].sections);
 // a peak at 1.5 kHz in A's custom shape
 const rows=FLAT_ROWS.map((r,i)=>(i===5?[1500,200,15]:r));
 const custom={a:rows,b:rows},P=loadProcessor(),freqs=[300,1500,6000];
 const shown=zplaneResponse(zplaneSections(ZPLANE_CUSTOM,ZPLANE_CUSTOM,0,0,.5,undefined,custom),freqs);
 freqs.forEach((hz,i)=>expect(Math.abs(gainAt(P,hz,{a:ZPLANE_CUSTOM,b:ZPLANE_CUSTOM,custom})-shown[i])).toBeLessThan(1.2));
 expect(shown[1]).toBeGreaterThan(shown[0]+8);
});

test('nodes: saved shapes are cleaned, laid into rows in order of frequency, and counted',()=>{
 expect(cleanNodes([[1,2,3,4]])).toBeNull();
 expect(cleanNodes([])).toBeNull();
 expect(cleanNodes([[100,1,'x']])).toBeNull();
 const clean=cleanNodes([[999999,1,99],[500,100,-3]]);
 expect(clean.count).toBe(2);expect(clean.rows).toHaveLength(12);
 expect(clean.rows[0]).toEqual([500,100,-3]);expect(clean.rows[1]).toEqual([12000,8,30]);
 expect(clean.rows.slice(2).every(r=>r[2]===0)).toBe(true);
 expect(sortRows([[900,1,0],[100,1,0],[500,1,0]]).map(r=>r[0])).toEqual([100,500,900]);
});

test('nodes can be added, taken out and resized; a built-in shape counts the nodes it really uses',()=>{
 const base=padNodes([[300,100,6],[2000,300,-6]]);
 const more=insertNode(base.rows,base.count,[900,200,3]);
 expect(more.count).toBe(3);expect(more.rows.slice(0,3).map(r=>r[0])).toEqual([300,900,2000]);
 expect(dropNode(more.rows,more.count,1).rows.slice(0,2).map(r=>r[0])).toEqual([300,2000]);
 expect(dropNode(padNodes([[300,1,1]]).rows,1,0)).toBeNull();
 expect(insertNode(padNodes(FLAT_ROWS).rows,12,[1,1,1])).toBeNull();
 const six=resizeNodes(base.rows,base.count,6);
 expect(six.count).toBe(6);expect(six.rows.slice(0,6).every((r,i,all)=>!i||all[i-1][0]<=r[0])).toBe(true);
 // growing keeps the existing nodes and adds flat ones; shrinking takes out the ones doing the least
 expect(six.rows.slice(0,6).filter(r=>r[2]!==0)).toHaveLength(2);
 const back=resizeNodes(six.rows,six.count,2);
 expect(back.rows.slice(0,2).map(r=>r[2])).toEqual([6,-6]);
 const get=k=>cleanRack()['zplane.'+k];
 expect(nodesOf(0,'a',get).count).toBe(5);       // Ah uses five formants
 expect(nodesOf(ZPLANE_CUSTOM,'a',get).count).toBe(6);
 expect(RACK_PARAMS.BY_KEY['zplane.can'].max).toBe(12);
});

test('twelve nodes run in the worklet, and sections with no boost are skipped without changing the sound',()=>{
 const P=loadProcessor(),rows=FLAT_ROWS.map((r,i)=>[r[0],r[1],i%2?5:-5]),custom={a:rows,b:rows};
 const shown=zplaneResponse(zplaneSections(ZPLANE_CUSTOM,ZPLANE_CUSTOM,0,0,.5,undefined,custom),[200,1000,5000]);
 [200,1000,5000].forEach((hz,i)=>expect(Math.abs(gainAt(P,hz,{a:ZPLANE_CUSTOM,b:ZPLANE_CUSTOM,custom})-shown[i])).toBeLessThan(1.5));
 const flat={a:FLAT_ROWS,b:FLAT_ROWS};
 expect(Math.abs(gainAt(P,1000,{a:ZPLANE_CUSTOM,b:ZPLANE_CUSTOM,custom:flat}))).toBeLessThan(.2);
});
