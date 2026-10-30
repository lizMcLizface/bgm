import { expressNotes } from './noteExpression';

const note=(role,length,velocity=.7)=>({role,midi:72,beat:0,length,velocity});
test('expression is deterministic metadata and preserves written notes, dynamics and percussion',()=>{
    const input=[note('lead',.2),note('pad',4),note('bass',1),note('perc',.2)],before=structuredClone(input);
    const options={voices:{lead:{name:'Flute'},pad:{name:'Felt piano'},bass:{name:'Chip bass'}},secondsPerBeat:.7,units:4};
    expressNotes(input,options);const plain=input.map(({expression,...n})=>n);
    expect(plain).toEqual(before);expect(expressNotes(structuredClone(before),options)).toEqual(input);
    expect(input[0].expression.gateScale).toBeLessThan(1);expect(input[1].expression.gateScale).toBe(1);
    expect(input[2].expression).toBeUndefined();expect(input[3].expression).toBeUndefined();
});
test('long wind notes soften their onset and retain the full written hold',()=>{
    const notes=[note('lead',.2),note('counter',8)];expressNotes(notes,{voices:{lead:{name:'Reed'},counter:{name:'Reed'}},secondsPerBeat:.5,units:4});
    expect(notes[0].expression.attackScale).toBeLessThan(1);expect(notes[1].expression.attackScale).toBeGreaterThan(1);
    expect(notes[1].expression.gateScale).toBe(1);expect(notes[1].expression.releaseScale).toBe(1);
    expect(notes[0].expression.brightnessCents).toBeGreaterThan(notes[1].expression.brightnessCents);
});

 test('held expression is independent, restricted to wind leads and respects patch vibrato', async()=>{
    const {expressHeldNotes}=await import('./noteExpression');
    const input=[note('lead',4),note('counter',4),note('pad',4),note('bass',4),note('lead',.2)];
    const options={voices:{lead:{name:'Reed Lead',preset:{vibratoDepth:0}},counter:{name:'Clarinet Lead',preset:{vibratoDepth:5}},pad:{name:'Wind Pad'},bass:{name:'Reed'}},secondsPerBeat:.5};
    const before=structuredClone(input);expressHeldNotes(input,options);
    expect(input.map(({expression,...n})=>n)).toEqual(before);
    expect(input[0].expression).toMatchObject({breathDepth:.18,vibratoDepth:8});
    expect(input[1].expression).toMatchObject({breathDepth:.18,vibratoDepth:0});
    expect(input.slice(2).every(n=>!n.expression)).toBe(true);
    for(const name of ['Classic Reed','Chip Flute','Piano','Plucked Wind']) {
        const events=[note('lead',4)];expressHeldNotes(events,{...options,voices:{lead:{name}}});expect(events[0].expression).toBeUndefined();
    }
 });

test('connection joins nearby steps across bars without altering notes or prior plans',async()=>{
    const {connectWindNotes}=await import('./noteExpression');
    const previous=[{...note('lead',.94),midi:67,beat:3}],before=structuredClone(previous);
    const events=[{...note('lead',.94),midi:69}, {...note('lead',.94),midi:71,beat:1},
        {...note('lead',.94),midi:71,beat:2}, {...note('lead',.4),midi:72,beat:3}];
    const plain=structuredClone(events),options={voices:{lead:{name:'Clarinet Lead'}},secondsPerBeat:.5,units:4,previous};
    connectWindNotes(events,options);
    expect(events[0].expression).toMatchObject({connected:true,connectionFrom:67,gateScale:1});
    expect(events[1].expression?.connected).toBe(true);expect(events[2].expression).toBeUndefined();
    expect(events.map(({expression,...n})=>n)).toEqual(plain);expect(previous).toEqual(before);
    const again=structuredClone(plain);connectWindNotes(again,options);expect(again).toEqual(events);
});
test('connection excludes real rests, large leaps, polyphony and non-wind roles',async()=>{
    const {connectWindNotes}=await import('./noteExpression');
    const options={voices:{lead:{name:'Reed Lead'}},secondsPerBeat:.5};
    for(const [midi,beat]of [[69,1.5],[79,1]]) {
        const events=[{...note('lead',.9),midi:67},{...note('lead',1),midi,beat}];
        connectWindNotes(events,options);expect(events.every(e=>!e.expression)).toBe(true);
    }
    const chord=[{...note('lead',1),midi:67},{...note('lead',1),midi:71},{...note('lead',1),midi:69,beat:1}];
    connectWindNotes(chord,options);expect(chord.every(e=>!e.expression)).toBe(true);
    for(const name of ['Chip Flute','Piano','Plucked Wind']) {
        const events=[{...note('lead',1),midi:67},{...note('lead',1),midi:69,beat:1}];
        connectWindNotes(events,{...options,voices:{lead:{name}}});expect(events.every(e=>!e.expression)).toBe(true);
    }
});

test('sound timing rules are independent metadata, respect physical/chip envelopes and use felt BPM',async()=>{
 const {timeSoundNotes}=await import('./noteExpression');
 const events=['lead','counter','pad','bass','perc'].map(role=>note(role,1)),before=structuredClone(events);
 const voices={lead:{name:'Reed Lead'},counter:{name:'Classic Lead'},pad:{name:'Piano'},bass:{name:'Plucked bass'}};
 timeSoundNotes(events,{voices,bpm:90,gateEnvelopes:true,tempoEffects:true});
 expect(events[0].expression).toMatchObject({gateAware:true,tempoBeat:2/3});
 expect(events.slice(1,4).every(e=>e.expression.tempoBeat===2/3&&!e.expression.gateAware)).toBe(true);expect(events[4].expression).toBeUndefined();
 expect(events.map(({expression,...e})=>e)).toEqual(before);
 const plain=structuredClone(before);timeSoundNotes(plain,{voices,bpm:90});expect(plain).toEqual(before);
});

test('a slow attack and vibrato set on a note by its source (the sequencer\'s held chords) survive the expression pass',()=>{
    const held={...note('pad',2),expression:{attackScale:8,vibratoDepth:5,vibratoDelay:.4,vibratoRate:4.6}},stab=note('pad',.45);
    expressNotes([held,stab],{voices:{pad:{name:'Felt piano'}},secondsPerBeat:.5,units:4});
    expect(held.expression).toMatchObject({attackScale:8,vibratoDepth:5,vibratoDelay:.4,vibratoRate:4.6});
    expect(stab.expression.attackScale).toBeLessThan(2);expect(stab.expression.vibratoDepth).toBeUndefined();
});
