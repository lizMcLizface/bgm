vi.mock('../../audio/context',()=>({audioContext:{currentTime:0}}));
import Instrument from './Instrument';
import PRESET_DEFAULTS from './presetDefaults';
import { cleanExpression, expressiveEnvelope, expressiveSource } from './noteExpression';

test('expression is bounded and absent expression leaves the old envelopes untouched',()=>{
    const env={attack:.1,release:.6};expect(expressiveEnvelope(env,2,null)).toEqual({env,duration:2});
    const e=cleanExpression({attackScale:NaN,gateScale:Infinity,releaseScale:5,brightnessCents:9999});
    expect(e).toMatchObject({attackScale:1,releaseScale:1,gateScale:1,brightnessCents:600,breathDepth:0,vibratoDepth:0});
    expect(cleanExpression(null)).toBeNull();
});
test('source expression is scoped to the note and changes filter and physical models safely',()=>{
    const source={filterOffset:10,filterEvents:[{type:'set',time:0,value:10}],piano:{brightness:.5},string:{damping:.5}},before=structuredClone(source);
    const result=expressiveSource(source,cleanExpression({brightnessCents:180}));
    expect(result.filterOffset).toBe(190);expect(result.filterEvents[0].value).toBe(190);
    expect(result.piano.brightness).toBe(.6);expect(result.string.damping).toBeLessThan(.5);
    expect(source).toEqual(before);
    const a=expressiveSource(source,cleanExpression({brightnessCents:70})),b=expressiveSource(source,cleanExpression({brightnessCents:80}));
    expect(a.piano).toEqual(b.piano);expect(a.string).toEqual(b.string);
    expect(a.filterOffset).not.toBe(b.filterOffset);
});
test('Instrument books expression on the voice audio plan and resets it on the next plain note',()=>{
    const booked=[],inst={preset:{...PRESET_DEFAULTS},polyphony:2,gainEnv:{attack:.1,hold:0,holdLevel:1,decay:.1,sustain:.6,release:.4},filterEnv:{attack:0,decay:.1,release:.1,amount:0},busyUntil:[0,0],soundUntil:0,
        voices:[{scheduleNote:(info,plan,time)=>booked.push({info,plan,time})}],allocateVoice:()=>({index:0,steal:false}),noteInfo:midi=>({freq:440,note:String(midi)}),filterOffset:()=>0,wake:()=>{},notePlan:Instrument.prototype.notePlan};
    const env=structuredClone(inst.gainEnv);
    Instrument.prototype.scheduleNote.call(inst,69,10,.2,.7,0,{attackScale:.75,releaseScale:.8,gateScale:.94,brightnessCents:100});
    Instrument.prototype.scheduleNote.call(inst,69,11,.2,.7,0);
    expect(booked[0].time).toBe(10);expect(booked[0].plan.filterOffset).toBe(100);expect(booked[1].plan.filterOffset).toBe(0);
    expect(booked[0].plan.gainPoints.at(-1)[0]).toBeLessThan(booked[1].plan.gainPoints.at(-1)[0]);
    expect(inst.gainEnv).toEqual(env);expect(inst.busyUntil[0]).toBe(11+booked[1].plan.gainPoints.at(-1)[0]);
});

test('breath contour only attenuates, retains gate and tail, and vibrato develops after onset', async()=>{
    const {breathEnvelope,heldPitchPoints}=await import('./noteExpression');
    const points=[[0,0],[.1,1],[2,.6],[2.5,0]],before=structuredClone(points);
    const contour=breathEnvelope(points,2,cleanExpression({breathDepth:.2}));
    expect(points).toEqual(before);expect(contour.at(-1)).toEqual([2.5,0]);
    expect(contour.every(([t,v],i)=>Number.isFinite(v)&&v>=0&&v<=1&&(i===0||t>contour[i-1][0]))).toBe(true);
    const pitch=heldPitchPoints({duration:2,depth:8,delay:.4,rate:5},{amount:30,decay:.1});
    for(const [t,v]of pitch) { const env=30*Math.exp(-3*t/.1); expect(Math.abs(v-env)).toBeLessThanOrEqual(8.00001);if(t<=.4)expect(v).toBeCloseTo(env,8); }
    expect(pitch.at(-1)[1]).toBeCloseTo(0,6);expect(pitch.length).toBe(121);
    expect(heldPitchPoints({duration:600,depth:8,delay:.4,rate:5}).length).toBeLessThan(2048);
});
test('pitch automation combines the pitch envelope and clears on voice reuse and silence', async()=>{
    const {default:MonoSynth}=await import('../../components/MonoSynth/MonoSynth');
    const params=Array.from({length:3},()=>({cancelScheduledValues:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn()}));
    const oscillators=params.map(detune=>({getOscillatorNode:()=>({detune})}));
    const synth={mainOscillators:()=>[oscillators[0]],voiceCount:1,subOscillator:oscillators[1],osc2:oscillators[2]};
    MonoSynth.prototype.scheduleNoteShape.call(synth,440,{pitchEnv:{amount:20,decay:.1},heldExpression:{duration:2,depth:8,delay:.4,rate:5}},10);
    expect(params[0].setValueAtTime).toHaveBeenLastCalledWith(20,10);expect(params[0].linearRampToValueAtTime).toHaveBeenCalledTimes(120);
    MonoSynth.prototype.scheduleNoteShape.call(synth,440,{pitchEnv:{amount:0,decay:0}},11);
    expect(params[0].cancelScheduledValues).toHaveBeenLastCalledWith(11);expect(params[0].setValueAtTime).toHaveBeenLastCalledWith(0,11);
    // A future plain note must not prevent pause from clearing the currently sounding held note.
    MonoSynth.prototype.clearHeldExpression.call(synth,10.5);expect(params[0].cancelScheduledValues).toHaveBeenLastCalledWith(10.5);
    expect(params[0].setTargetAtTime).toHaveBeenLastCalledWith(0,10.5,.015);
});

test('connection softens the attack without changing preset, gate, release or plain-note behavior',()=>{
    const env={attack:.12,release:.4},before=structuredClone(env);
    const x=cleanExpression({connected:true,gateScale:1});
    expect(expressiveEnvelope(env,.5,x)).toEqual({env:{attack:.025,release:.4},duration:.5});
    expect(expressiveEnvelope(env,.5,cleanExpression({connected:'yes'}))).toEqual({env,duration:.5});
    expect(expressiveEnvelope({...env,attack:0},.5,x).env.attack).toBe(0);
    expect(expressiveEnvelope(env,.5,null)).toEqual({env,duration:.5});expect(env).toEqual(before);
});

test('gate-aware gain and filter envelopes shorten excess stages while preserving holds and natural releases',async()=>{
 const {gateEnvelope}=await import('./noteExpression'),env={attack:.1,decay:1.5,release:1.2,sustain:.4},before=structuredClone(env);
 const short=expressiveEnvelope(env,.2,cleanExpression({gateAware:true}));
 expect(short.env.decay).toBeCloseTo(.12);expect(short.env.release).toBeCloseTo(.13);expect(short.duration).toBe(.2);expect(short.env.sustain).toBe(.4);
 expect(gateEnvelope(env,2,{gateAware:true}).release).toBe(1.2);expect(gateEnvelope(env,.2,null)).toBe(env);
 expect(gateEnvelope({...env,release:.01},.2,{gateAware:true}).release).toBe(.01);expect(env).toEqual(before);
});

test('slide plans interpolate cents to the written pitch, combine vibrato and reset on reuse',async()=>{
 const {expressivePitchPoints}=await import('./noteExpression');
 const plan={slide:{cents:-300,seconds:.2},pitchEnv:{amount:0,decay:0}};
 const points=expressivePitchPoints(plan);expect(points[0]).toEqual([0,-300]);expect(points.find(([t])=>Math.abs(t-.2)<1e-8)[1]).toBe(0);
 expect(points.every(([,c])=>c>=-300&&c<=0)).toBe(true);expect(expressivePitchPoints({})).toBeNull();
 const both=expressivePitchPoints({...plan,heldExpression:{duration:2,depth:8,delay:.4,rate:5}});expect(both[0][1]).toBe(-300);expect(Math.abs(both.find(([t])=>t>.7)[1])).toBeLessThanOrEqual(8);
 const {default:MonoSynth}=await import('../../components/MonoSynth/MonoSynth');const param={cancelScheduledValues:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn()};const osc={getOscillatorNode:()=>({detune:param})};
 const synth={mainOscillators:()=>[osc],voiceCount:1,subOscillator:osc,osc2:osc};MonoSynth.prototype.scheduleNoteShape.call(synth,440,plan,10);
 expect(param.setValueAtTime).toHaveBeenCalledWith(-300,10);MonoSynth.prototype.scheduleNoteShape.call(synth,440,{pitchEnv:{amount:0}},11);expect(param.setValueAtTime).toHaveBeenLastCalledWith(0,11);
});

test('a chord slide reaches only its selected voice and respects the patch tuning',()=>{
 const booked=[],inst={preset:{...PRESET_DEFAULTS},polyphony:8,gainEnv:{attack:.1,hold:0,holdLevel:1,decay:.1,sustain:.6,release:.4},filterEnv:{attack:0,decay:.1,release:.1,amount:0},busyUntil:Array(8).fill(0),soundUntil:0,
 voices:Array.from({length:3},()=>({scheduleNote:(info,plan,time)=>booked.push({info,plan,time})})),allocateVoice:()=>({index:booked.length,steal:false}),noteInfo:midi=>({freq:midi===64?300:midi===65?330:220,note:String(midi)}),filterOffset:()=>0,wake:()=>{},notePlan:Instrument.prototype.notePlan};
 for(const midi of [60,65,67])Instrument.prototype.scheduleNote.call(inst,midi,10,3,.7,0,midi===65?{slideFromMidi:64,slideSeconds:.8}:null);
 expect(booked[0].plan.slide).toBeUndefined();expect(booked[2].plan.slide).toBeUndefined();expect(booked[1].plan.slide.cents).toBeCloseTo(1200*Math.log2(300/330));expect(booked[1].plan.slide.seconds).toBe(.8);
 expect(booked.every(n=>n.plan.gainPoints.at(-1)[0]===3.4)).toBe(true);
});

test('continuous motion runs through long tails and resets when the voice is reused', async()=>{
 const {expressivePitchPoints,pitchMotionCents}=await import('./noteExpression');
 const {default:MonoSynth}=await import('../../components/MonoSynth/MonoSynth');
 const motion={phase:.4,rate:.5,depth:35};
 const expr=cleanExpression({pitchMotion:motion});
 const plan=expressiveSource({duration:1,gainPoints:[[0,0],[.1,1],[4,0]],filterOffset:0,filterEvents:[],pitchEnv:{amount:0,decay:0}},expr);
 const points=expressivePitchPoints(plan);
 expect(points.at(-1)[0]).toBe(4);expect(points[0][1]).toBeCloseTo(pitchMotionCents(motion,0));
 expect(points.at(-1)[1]).toBeCloseTo(pitchMotionCents(motion,4));
 const detune={cancelScheduledValues:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn()},osc={getOscillatorNode:()=>({detune})};
 const synth={mainOscillators:()=>[osc],voiceCount:1,subOscillator:osc,osc2:osc};
 MonoSynth.prototype.scheduleNoteShape.call(synth,440,plan,10);
 expect(detune.linearRampToValueAtTime).toHaveBeenLastCalledWith(points.at(-1)[1],14);
 MonoSynth.prototype.scheduleNoteShape.call(synth,440,{pitchEnv:{amount:0,decay:0}},15);
 expect(detune.setValueAtTime).toHaveBeenLastCalledWith(0,15);
 MonoSynth.prototype.clearHeldExpression.call(synth,12);expect(detune.cancelScheduledValues).toHaveBeenLastCalledWith(12);
 expect(cleanExpression({pitchMotion:{depth:Infinity,rate:99,phase:NaN}}).pitchMotion).toEqual({depth:0,rate:4,phase:0});
});

test('held pitch targets interpolate through one note and preserve its envelope and tuning',async()=>{
 const {cleanPitchTargets,expressivePitchPoints,pitchPathCents}=await import('./noteExpression');
 expect(cleanPitchTargets([{time:NaN,midi:60},{time:-1,midi:60},{time:3,midi:65},{time:1,midi:62},{time:3,midi:67}])).toEqual([{time:1,midi:62},{time:3,midi:67}]);
 expect(cleanPitchTargets(null)).toBeNull();expect(cleanPitchTargets(Array.from({length:100},(_,i)=>({time:i/10,midi:60})))).toHaveLength(64);
 const booked=[],inst={preset:{...PRESET_DEFAULTS},polyphony:8,gainEnv:{attack:.1,hold:0,holdLevel:1,decay:.1,sustain:.6,release:.4},filterEnv:{attack:0,decay:.1,release:.1,amount:0},busyUntil:[0],soundUntil:0,
 voices:[{scheduleNote:(info,plan,time)=>booked.push({info,plan,time})}],allocateVoice:()=>({index:0,steal:false}),noteInfo:midi=>({freq:300*Math.pow(1.9,(midi-60)/12),note:String(midi)}),filterOffset:()=>0,wake:()=>{},notePlan:Instrument.prototype.notePlan};
 Instrument.prototype.scheduleNote.call(inst,60,10,12,.7,0,{pitchTargets:[{time:0,midi:60},{time:2,midi:60},{time:4,midi:65},{time:6,midi:65},{time:8,midi:60},{time:20,midi:80}]});
 expect(booked).toHaveLength(1);const plan=booked[0].plan,path=plan.pitchPath;
 expect(plan.gainPoints.at(-1)[0]).toBe(12.4);expect(path).toHaveLength(5);expect(path[2].cents).toBeCloseTo(1200*Math.log2(Math.pow(1.9,5/12)));
 expect(pitchPathCents(path,3)).toBeCloseTo(path[2].cents/2);expect(pitchPathCents(path,12)).toBe(0);
 const points=expressivePitchPoints(plan);expect(points.find(([t])=>t===4)[1]).toBeCloseTo(path[2].cents);expect(points.every(([,c])=>Number.isFinite(c))).toBe(true);
 const {default:MonoSynth}=await import('../../components/MonoSynth/MonoSynth');
 const detune={cancelScheduledValues:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn()},osc={getOscillatorNode:()=>({detune})},synth={mainOscillators:()=>[osc],voiceCount:1,subOscillator:osc,osc2:osc};
 MonoSynth.prototype.scheduleNoteShape.call(synth,300,plan,10);expect(detune.linearRampToValueAtTime).toHaveBeenCalledWith(path[2].cents,14);
 MonoSynth.prototype.clearHeldExpression.call(synth,13);expect(detune.cancelScheduledValues).toHaveBeenLastCalledWith(13);
 MonoSynth.prototype.scheduleNoteShape.call(synth,300,{pitchEnv:{amount:0}},16);expect(detune.setValueAtTime).toHaveBeenLastCalledWith(0,16);
});
