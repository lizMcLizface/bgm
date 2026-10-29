// Generator planning, without audio: the audio layer and Instruments are
// stubbed (jsdom has no Web Audio), and bars are planned by advancing the
// "current bar" by hand, as the Transport would.

import { scaleDistance } from './conductor';
import PROGRESSIONS from './progressions';
import { defaultSettings } from './settings';
import { METERS, beatStarts, groupStarts, chordBars, splitBeat } from './meter';

vi.mock('../audio/context', () => ({
    audioContext: {
        currentTime: 0,
        state: 'running',
        resume: () => Promise.resolve(),
        createGain: () => {
            const gain = {
                value: 1,
                setTargetAtTime: (v) => { gain.value = v; },
                setValueAtTime: (v) => { gain.value = v; },
                cancelScheduledValues: () => {},
            };
            return { connect: () => {}, gain };
        },
        createConstantSource: () => ({ connect: () => {}, disconnect: () => {}, start: () => {}, stop: () => {}, offset: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} } }),
        createChannelSplitter: () => ({ connect: () => {}, disconnect: () => {} }),
        createChannelMerger: () => ({ connect: () => {}, disconnect: () => {} }),
        createWaveShaper: () => ({ connect: () => {}, disconnect: () => {} }),
        createPeriodicWave: () => ({}),
        createOscillator: () => ({
            connect: () => {}, disconnect: () => {}, start: () => {}, stop: () => {}, setPeriodicWave: () => {}, frequency: { value: 0 },
        }),
        createBiquadFilter: () => {
            const param = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, cancelScheduledValues() {} });
            return { connect: () => {}, frequency: param(), Q: param() };
        },
    },
}));
vi.mock('../audio/bus', () => ({ masterBus: {} }));
// vi.mock factories are hoisted above imports; shared state must be too.
const mockBooked = vi.hoisted(() => []);
vi.mock('./engine/Instrument', () => ({ default: class {
    constructor({ polyphony }) { this.polyphony = polyphony; this.preset = {}; }
    connect() {}
    applyPreset() {}
    scheduleNote(midi, start, duration, velocity, detune) { mockBooked.push({ midi, start, duration, velocity, detune }); }
    silence() {}
    flushTails() {}
} }));

const mockHits = vi.hoisted(() => []);
vi.mock('./engine/drumKit', () => ({ default: class {
    constructor() { this.polyphony = 0; this.preset = {}; this.bus={gain:{setTargetAtTime(){}}}; }
    futureBookings(){return [];}
    dispose(){}
    setKit() {}
    setVoicePreset(id) {this.voicePreset=id;}
    connect() {}
    scheduleNote(drum, start, duration, velocity) { mockHits.push({ drum, start, velocity }); }
    silence() {}
    flushTails() {}
} }));

const percussionMock=vi.hoisted(()=>({fail:false}));
vi.mock('./engine/wasmDrumKit',()=>({default:class {
 constructor(){this.preset={};this.ready=percussionMock.fail?Promise.reject(Error('Kernel unavailable')):Promise.resolve();}
 setKit(kit){this.kit=kit;}
 setVoicePreset(id){this.voicePreset=id;}
 connect(){} scheduleNote(){} silence(){} flushTails(){} dispose(){}
}}));
import Generator from './Generator';

test('optional rulebook tracing records actual borrowing without changing notes or the baseline chord shape',()=>{
    const g=new Generator({...defaultSettings(),seed:42,chordBorrow:1,sections:{mode:'gentle',phrases:2}});
    const baseline=g.planner(),traced=g.planner();traced.rulebookTrace=true;
    for(let bar=0;bar<64;bar++){
        baseline.planBar(bar);traced.planBar(bar);const a=baseline.plan.get(bar),b=traced.plan.get(bar),{provenance,...chord}=b.chord;
        expect(chord).toEqual(a.chord);expect(b.events).toEqual(a.events);expect(provenance).toBeTruthy();
    }
    expect(traced.buildChord(traced.homeMusic(),'I','plain',true).provenance.borrowed).toBe(false);
    expect(traced.buildChord(traced.homeMusic(),'IV','plain',true).provenance.borrowed).toBe(true);
    expect(traced.planner().rulebookTrace).toBe(true);
});

test('developed strategies preserve actual forecasts, theme memory and restored boundary state',async()=>{
    const {SCENES,sceneSettings,sceneSlug}=await import('./scenes');
    for(const preset of ['open-mic-pad','deep-night','replicant-blues','oxygen-debt','fireside-folk']){
        const settings=sceneSettings(SCENES.find(s=>sceneSlug(s.name)===preset),17);
        settings.ambience=Object.fromEntries(Object.keys(settings.ambience).map(k=>[k,0]));
        settings.sections={mode:'gentle',phrases:2};settings.drift={...settings.drift,mode:'wandering',keyChance:.5,modeChance:.5};
        const g=new Generator(settings),p=g.planner(),forecasts=[];
        for(let bar=0;bar<128;bar++){p.planBar(bar);const b=p.plan.get(bar);if(bar%4===0)forecasts.push(p.melodyHarmony(bar,b.music,b.upcoming,8,b.bpm));
            expect(b.boundaries.phrase.start).toBe(b.state.composition.phrase.start);
            expect(b.boundaries.phrase.bars).toBe(b.state.composition.phrase.bars);
            expect(b.events.every(e=>[e.midi,e.beat,e.length,e.velocity].every(Number.isFinite)&&e.length>0)).toBe(true);
        }
        for(const forecast of forecasts)for(const h of forecast.filter(h=>h.bar<128))expect(h.chord).toEqual(p.plan.get(h.bar).chord);
        expect(p.plan.get(127).state.composition.themes).toEqual(p.plan.get(0).state.composition.themes);
        const copy=g.planner();for(let bar=0;bar<48;bar++)copy.planBar(bar);
        copy.plan.set(47,JSON.parse(JSON.stringify(copy.plan.get(47))));
        for(let bar=48;bar<128;bar++){copy.planBar(bar);expect(copy.plan.get(bar)).toEqual(p.plan.get(bar));copy.plan.delete(bar-2);}
    }
},20000);

test('new form layers respect Sections Off and Original, and planner flags survive copies',()=>{
    for(const generation of ['latest','legacy']){
        const settings={...defaultSettings(),seed:42,generation,sections:{mode:generation==='latest'?'off':'strong',phrases:2}};
        const g=new Generator(settings),a=g.planner(),b=g.planner({formStrategies:false,sectionCurves:false,harmonicDevelopment:false});
        for(let bar=0;bar<48;bar++){a.planBar(bar);b.planBar(bar);expect(a.plan.get(bar).events).toEqual(b.plan.get(bar).events);expect(a.plan.get(bar).chord).toEqual(b.plan.get(bar).chord);}
    }
    const g=new Generator(defaultSettings()),p=g.planner({formStrategies:false,sectionCurves:false,harmonicDevelopment:false,endingDevelopment:false,formStrategy:'speech'});
    for(const key of ['formStrategies','sectionCurves','harmonicDevelopment','endingDevelopment'])expect(p.planner()[key]).toBe(false);expect(p.planner().formStrategy).toBe('speech');
});

test('endings clear unheard phrase resolutions and section gestures while retaining themes and silence choices',()=>{
    for(const leadActivity of [0,1]){
        const g=new Generator({...defaultSettings(),seed:42,leadActivity,sections:{mode:'strong',phrases:2}}),p=g.planner();p.endBar=16;
        for(let bar=0;bar<20;bar++)p.planBar(bar);
        const prep=p.plan.get(15),tonic=p.plan.get(16),tail=p.plan.get(18);
        expect(prep.boundaries.ending.phase).toBe('prepare');expect(prep.state.composition.ending.phase).toBe('prepare');
        expect(prep.events.every(e=>e.beat+e.length<=p.meter.units+.00001)).toBe(true);
        expect(tonic.chord.numeral).toBe('I');expect(tonic.state.phrase.section).toBeNull();
        expect(tonic.state.composition.melody).toBeUndefined();expect(tonic.state.composition.joint).toBeUndefined();expect(tonic.state.composition.sectionSuspension).toBeUndefined();
        expect(tonic.state.composition.themes).toEqual(prep.state.composition.themes);expect(tail.events).toEqual([]);expect(tail.boundaries.ending.phase).toBe('tail');
        if(leadActivity===0)expect(tonic.events.some(e=>e.role==='lead')).toBe(false);
    }
});

test('section suspensions are committed before booking and resolve across serialised phrase handoffs',async()=>{
    const {SCENES,sceneSettings,sceneSlug}=await import('./scenes');
    const g=new Generator({...sceneSettings(SCENES.find(s=>sceneSlug(s.name)==='boss-fight-politely'),4),
        sections:{mode:'gentle',phrases:1},humanize:{timing:0,velocity:0,detune:0},swing:0});
    const a=g.planner(),before=g.planner({sectionSuspensions:false});
    for(let bar=0;bar<96;bar++){a.planBar(bar);before.planBar(bar);}
    const prepared=[...a.plan.values()].filter(b=>b.state.composition.sectionSuspension);
    expect(prepared.length).toBeGreaterThan(0);
    for(const b of prepared){const s=b.state.composition.sectionSuspension;if(s.to.bar>=96)continue;
        const arrival=a.plan.get(s.to.bar),resolved=arrival.state.composition.sectionSuspensionArrival;
        expect(resolved.status).toBe('resolved');
        expect(arrival.events.find(e=>e.role==='lead'&&e.beat===resolved.to.beat)?.midi).toBe(resolved.to.midi);
        expect(b.events.find(e=>e.role==='lead'&&e.beat===s.from.beat)?.length).toBe(s.length);
        expect(b.chord.pitchClasses).toContain(s.from.midi%12);expect(arrival.chord.pitchClasses).not.toContain(s.from.midi%12);
    }
    expect([...a.plan.values()].map(b=>b.chord)).toEqual([...before.plan.values()].map(b=>b.chord));
    const at=prepared[0].bar,saved=JSON.parse(JSON.stringify(a.plan.get(at))),copy=g.planner();
    for(let bar=0;bar<=at;bar++)copy.planBar(bar);copy.plan.set(at,saved);
    for(let bar=at+1;bar<96;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual([...a.plan.values()]);
    const trimmed=g.planner();
    for(let bar=0;bar<96;bar++){
        trimmed.planBar(bar);
        expect(trimmed.plan.get(bar)).toEqual(a.plan.get(bar));
        trimmed.plan.delete(bar-2);
    }
    const edited=g.planner();for(let bar=0;bar<=at;bar++)edited.planBar(bar);
    edited.settings.leadActivity=0;edited.planBar(at+1);
    expect(edited.plan.get(at+1).events.filter(e=>e.role==='lead')).toEqual([]);
    expect(edited.plan.get(at+1).state.composition.sectionSuspensionArrival.status).toBe('cancelled');
    const ending=g.planner();ending.endBar=8;for(let bar=0;bar<=8;bar++)ending.planBar(bar);
    expect([...ending.plan.values()].every(b=>!b.state.composition.sectionSuspension)).toBe(true);
    const drift=g.planner(),plain=g.planner({sectionSuspensions:false});
    for(const p of [drift,plain])p.settings.drift={...p.settings.drift,mode:'wandering',keyChance:1,modeChance:1};
    for(let bar=0;bar<64;bar++){drift.planBar(bar);plain.planBar(bar);}
    for(let bar=0;bar<64;bar++){
        expect(drift.plan.get(bar).chord).toEqual(plain.plan.get(bar).chord);
        expect(drift.plan.get(bar).upcoming).toEqual(plain.plan.get(bar).upcoming);
    }
});

test('section pickups agree across forecast, offline restore and committed resolutions',()=>{
    const g=new Generator({...defaultSettings(),seed:7,leadActivity:1,leadDensity:.6,sections:{mode:'gentle',phrases:1},humanize:{timing:0,velocity:0,detune:0}});
    const a=g.planner(),before=g.planner({leadPickups:false});for(let bar=0;bar<96;bar++){a.planBar(bar);before.planBar(bar);}
    expect([...a.plan.values()].some(b=>b.state.composition.leadPickup?.changed)).toBe(true);
    for(const b of a.plan.values())if(b.state.composition.leadPickup?.changed){
        expect(b.state.composition.leadPickup.kind).toBe('gather');expect(b.state.composition.leadPickup.step).toBe(1);
    }
    const resolutions=new Map([...a.plan.values()].flatMap(b=>b.state.composition.melody?.resolutions??[]).map(r=>[JSON.stringify(r),r]));
    for(const r of resolutions.values())if(r.to.bar<96)expect(a.plan.get(r.to.bar).events.find(e=>e.role==='lead'&&e.beat===r.to.beat)?.midi).toBe(r.to.midi);
    const copy=g.planner();for(let bar=0;bar<96;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual([...a.plan.values()]);
    const saved=JSON.parse(JSON.stringify(copy.plan.get(6)));for(let bar=7;bar<96;bar++)copy.plan.delete(bar);copy.plan.set(6,saved);
    for(let bar=7;bar<96;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual([...a.plan.values()]);
    const ending=g.planner();ending.endBar=8;for(let bar=0;bar<=8;bar++)ending.planBar(bar);
    expect([...ending.plan.values()].every(b=>!b.state.composition.leadPickup)).toBe(true);
});

test('lead transition fragments keep planned resolutions and survive offline restore',()=>{
    const g=new Generator({...defaultSettings(),seed:7,leadActivity:1,leadDensity:1,sections:{mode:'gentle',phrases:2},humanize:{timing:0,velocity:0,detune:0}});
    const a=g.planner(),before=g.planner({leadTransitions:false});
    for(let bar=0;bar<64;bar++){a.planBar(bar);before.planBar(bar);}
    expect([...a.plan.values()].some(b=>b.state.composition.leadTransition?.removed>0)).toBe(true);
    const points=new Map([...a.plan.values()].flatMap(b=>b.state.composition.melody?.resolutions??[]).map(r=>[JSON.stringify(r),r]));
    for(const r of points.values())if(r.to.bar<64){
        const event=a.plan.get(r.to.bar).events.find(e=>e.role==='lead'&&e.beat===r.to.beat);
        expect(event?.midi).toBe(r.to.midi);
    }
    const copy=g.planner();for(let bar=0;bar<64;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual([...a.plan.values()]);
    const saved=JSON.parse(JSON.stringify(copy.plan.get(6)));for(let bar=7;bar<64;bar++)copy.plan.delete(bar);copy.plan.set(6,saved);
    for(let bar=7;bar<64;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual([...a.plan.values()]);
    const ending=g.planner();ending.endBar=8;for(let bar=0;bar<=8;bar++)ending.planBar(bar);
    expect([...ending.plan.values()].every(b=>!b.state.composition.leadTransition)).toBe(true);
});

test('transition gestures preserve lead rhythm and agree across offline and saved-state plans',()=>{
    const gen=new Generator({...defaultSettings(),seed:42,leadActivity:1,leadDensity:.75,sections:{mode:'strong',phrases:2},
        padWeights:{pulse:1},counter:{mode:'line',activity:1},humanize:{timing:0,velocity:0,detune:0}});
    const current=gen.planner(),before=gen.planner({transitionGestures:false});
    for(let bar=0;bar<64;bar++){current.planBar(bar);before.planBar(bar);}
    expect([...current.plan.values()].some(b=>b.state.composition.transitionGesture)).toBe(true);
    expect([...current.plan.values()].some(b=>JSON.stringify(b.events)!==JSON.stringify(before.plan.get(b.bar).events))).toBe(true);
    const rhythm=b=>b.events.filter(e=>e.role==='lead').map(e=>[e.beat,e.length]);
    for(const b of current.plan.values())expect(rhythm(b)).toEqual(rhythm(before.plan.get(b.bar)));
    const saved=JSON.parse(JSON.stringify(current.plan.get(10)));for(let bar=11;bar<64;bar++)current.plan.delete(bar);current.plan.set(10,saved);
    for(let bar=11;bar<64;bar++)current.planBar(bar);
    const again=gen.planner();for(let bar=0;bar<64;bar++)again.planBar(bar);
    expect([...current.plan.values()]).toEqual([...again.plan.values()]);
    const ending=gen.planner(),plainEnding=gen.planner({transitionGestures:false});ending.endBar=8;plainEnding.endBar=8;
    for(let bar=0;bar<=8;bar++){ending.planBar(bar);plainEnding.planBar(bar);}
    expect([...ending.plan.values()].every(b=>!b.state.composition.transitionGesture)).toBe(true);
    expect([...ending.plan.values()]).toEqual([...plainEnding.plan.values()]);
});

test('variable harmonic rhythm preserves progression order and forecasts including frozen colours',()=>{
    const settings={...defaultSettings(),seed:42,barsPerChord:2,sections:{mode:'strong',phrases:4},chordColour:{mode:'sus',amount:.5},chordBorrow:.3};
    const gen=new Generator(settings),forecasts=[];
    for(let bar=0;bar<64;bar++){
        gen.planBar(bar);const b=gen.plan.get(bar);forecasts.push(gen.melodyHarmony(bar,b.music,b.upcoming,8,b.bpm));
    }
    expect(gen.plan.get(0).music.harmonicDurations).toEqual([3,1,2,2]);
    expect([0,1,2].map(bar=>gen.plan.get(bar).chord)).toEqual(Array(3).fill(gen.plan.get(0).chord));
    expect(gen.plan.get(2).chordStart).toBe(false);expect(gen.plan.get(3).chordStart).toBe(true);
    for(const forecast of forecasts)for(const h of forecast.filter(h=>h.bar<64))expect(h.chord).toEqual(gen.plan.get(h.bar).chord);
    const off=gen.planner({harmonicRhythm:false});for(let bar=0;bar<64;bar++)off.planBar(bar);
    expect(off.plan.get(2).chord.name).not.toBe(gen.plan.get(2).chord.name);
    const copy=gen.planner();for(let bar=0;bar<64;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual([...gen.plan.values()]);
    const saved=JSON.parse(JSON.stringify(copy.plan.get(1)));for(let bar=2;bar<64;bar++)copy.plan.delete(bar);copy.plan.set(1,saved);
    for(let bar=2;bar<64;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual([...gen.plan.values()]);
    for(const patch of [{generation:'legacy'},{sections:{mode:'off',phrases:4}}]){
        const baseline=new Generator({...settings,...patch}),enabled=baseline.planner(),fixed=baseline.planner({harmonicRhythm:false});
        for(let bar=0;bar<16;bar++){enabled.planBar(bar);fixed.planBar(bar);}
        expect([...enabled.plan.values()]).toEqual([...fixed.plan.values()]);
    }
});

test('section cadences agree with future harmony, offline planning and restored state', () => {
    const settings={...defaultSettings(),generation:'latest',seed:42,sections:{mode:'strong',phrases:2},barsPerChord:2};
    const gen=new Generator(settings);gen.reset();
    const forecasts=[];
    for(let bar=0;bar<64;bar++){
        gen.planBar(bar);const b=gen.plan.get(bar);
        forecasts.push(gen.melodyHarmony(bar,b.music,b.upcoming,8,b.bpm));
    }
    const planned=[...gen.plan.values()];
    expect(planned.some(b=>b.chord.cadence?.kind==='prepare')).toBe(true);
    expect(planned.some(b=>b.chord.cadence?.kind==='arrive')).toBe(true);
    for(const forecast of forecasts)for(const h of forecast.filter(h=>h.bar<64))expect(h.chord).toEqual(gen.plan.get(h.bar).chord);
    const offline=gen.planner();for(let bar=0;bar<64;bar++)offline.planBar(bar);
    expect([...offline.plan.values()]).toEqual(planned);
    const restored=JSON.parse(JSON.stringify(offline.plan.get(12)));
    for(let bar=13;bar<64;bar++)offline.plan.delete(bar);offline.plan.set(12,restored);
    for(let bar=13;bar<64;bar++)offline.planBar(bar);
    expect([...offline.plan.values()]).toEqual(planned);
    const before=gen.planner({sectionCadences:false});for(let bar=0;bar<64;bar++)before.planBar(bar);
    expect([...before.plan.values()].every(b=>!b.chord.cadence)).toBe(true);
    expect(planned.some(b=>before.plan.get(b.bar).chord.name!==b.chord.name)).toBe(true);
});

test('section cadences preserve Original, Sections Off, pivots and explicit endings', () => {
    for(const generation of ['legacy','latest']){
        const gen=new Generator({...defaultSettings(),generation,sections:{mode:generation==='legacy'?'strong':'off',phrases:2}});
        const bars=play(gen,32);expect(bars.every(b=>!b.chord.cadence)).toBe(true);
    }
    const gen=new Generator({...defaultSettings(),generation:'latest',sections:{mode:'strong',phrases:2}});
    const music={...gen.homeMusic(),cycleStart:0}, upcoming={...music,tonic:(music.tonic+7)%12};
    const pivot=gen.chordFor(3,music,upcoming);
    expect(gen.sectionChord(3,music,upcoming,pivot)).toEqual(pivot);
    gen.endBar=8;for(let bar=0;bar<=8;bar++)gen.planBar(bar);
    expect(gen.plan.get(7).chord).toEqual(gen.buildChord(music,'V'));
    expect(gen.plan.get(8).chord).toEqual(gen.buildChord(music,'I'));
});

test('common-tone bridges preserve whole slots and survive offline and saved-state continuation', () => {
    const gen=new Generator({...defaultSettings(),seed:42,sections:{mode:'strong',phrases:2},barsPerChord:2});
    const planned=play(gen,96),bridges=planned.filter(b=>b.chord.cadence?.kind==='bridge');
    expect(bridges.length).toBeGreaterThan(0);
    for(const b of bridges){
        const c=b.chord.cadence;
        expect(c.sharedBefore.length).toBeGreaterThan(0);expect(c.sharedAfter.length).toBeGreaterThan(0);
        for(const pc of c.sharedBefore)expect(gen.plan.get(c.arrivalBar-5).chord.pitchClasses).toContain(pc);
        for(const pc of c.sharedAfter)expect(gen.plan.get(c.arrivalBar-2).chord.pitchClasses).toContain(pc);
        expect(c.arrivalBar-b.bar).toBeGreaterThanOrEqual(3);expect(c.arrivalBar-b.bar).toBeLessThanOrEqual(4);
        expect(b.chord.pitchClasses).toEqual(gen.buildChord(b.music,c.numeral,gen.colourFor(b.bar),gen.borrowFor(b.bar)).pitchClasses);
    }
    const offline=gen.planner();for(let bar=0;bar<96;bar++)offline.planBar(bar);
    expect([...offline.plan.values()]).toEqual(planned);
    const at=bridges[0].bar,saved=JSON.parse(JSON.stringify(offline.plan.get(at)));
    for(let bar=at+1;bar<96;bar++)offline.plan.delete(bar);offline.plan.set(at,saved);
    for(let bar=at+1;bar<96;bar++)offline.planBar(bar);
    expect([...offline.plan.values()]).toEqual(planned);
    const before=gen.planner({sectionBridges:false});for(let bar=0;bar<96;bar++)before.planBar(bar);
    expect([...before.plan.values()].every(b=>b.chord.cadence?.kind!=='bridge')).toBe(true);
    expect([...before.plan.values()].some(b=>b.chord.cadence?.kind==='prepare')).toBe(true);
    const ending=gen.planner();ending.endBar=bridges[0].chord.cadence.arrivalBar+1;
    for(let bar=0;bar<=ending.endBar;bar++)ending.planBar(bar);
    expect(ending.plan.get(at).chord.cadence?.kind).not.toBe('bridge');
});

test('cadence forecasts stay on the actual chord grid through modal drift and odd meters', () => {
    for(const [meter,barsPerChord] of [['3/4',1],['7/4',2],['6/8',3],['4/4',4]]){
        const settings={...defaultSettings(),seed:7,meter,barsPerChord,sections:{mode:'gentle',phrases:2},leadDensity:.5};
        settings.drift={...settings.drift,mode:'wandering',keyChance:1,modeChance:1,progressionChance:1};
        const gen=new Generator(settings),forecasts=[];
        for(let bar=0;bar<64;bar++){
            gen.planBar(bar);const b=gen.plan.get(bar);
            // (as planned: 7/4 plays a chord a bar at two bars per chord, meter.js chordBars)
            forecasts.push(gen.withPlanningSettings(()=>gen.melodyHarmony(bar,b.music,b.upcoming,8,b.bpm)));
        }
        for(const forecast of forecasts)for(const h of forecast.filter(h=>h.bar<64))expect(h.chord).toEqual(gen.plan.get(h.bar).chord);
        for(const b of gen.plan.values())if(b.chord.cadence){
            expect(Math.abs((b.state.phrase.section.start-b.music.cycleStart)%b.chordBars)).toBe(0);
            if(b.chordStart)expect(Math.abs((b.bar-b.music.cycleStart)%b.chordBars)).toBe(0);
        }
    }
});

function play(gen, bars) {
    const out = [];
    for (let bar = 0; bar < bars; bar++) {
        gen.currentBar = bar;
        gen.ensurePlanned(bar);
        out.push(gen.plan.get(bar));
    }
    return out;
}

function generator(seed, drift) {
    const gen = new Generator();
    gen.settings.seed = seed;
    gen.settings.drift = { ...gen.settings.drift, ...drift };
    gen.reset();
    return gen;
}

const HOME = { tonic: 0, mode: 'Major-1' };

test('drift off: the home progression loops in the home key at home tempo', () => {
    const bars = play(generator(1, { mode: 'off' }), 32);
    expect(bars.map((b) => b.chord.name).slice(0, 8)).toEqual(['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']);
    bars.forEach((b) => {
        expect(b.chord.keyName).toBe('C Ionian');
        expect(b.bpm).toBe(72);
    });
});

test('centered drift: changes happen only at cycle starts and stay near home', () => {
    const drift = { mode: 'centered', keyChance: 0.6, modeChance: 0.3, progressionChance: 0.5, tempoChance: 0.6 };
    [1, 2, 3].forEach((seed) => {
        const bars = play(generator(seed, drift), 200);
        bars.slice(1).forEach((b, i) => {
            const prev = bars[i];
            const changed = ['tonic', 'mode', 'progression'].some((k) => b.music[k] !== prev.music[k]);
            if (changed) expect(b.music.cycleStart).toBe(b.bar);
            expect(scaleDistance(b.music, HOME)).toBeLessThanOrEqual(2);
        });
        expect(new Set(bars.map((b) => b.chord.keyName)).size).toBeGreaterThan(1);
    });
});

test('a key change is prepared by the new key\'s V chord in the last chord slot', () => {
    const drift = { mode: 'centered', keyChance: 1, modeChance: 0, progressionChance: 0, tempoChance: 0, pivot: true };
    const bars = play(generator(5, drift), 64);
    let pivots = 0;
    bars.slice(0, -1).forEach((b, i) => {
        const next = bars[i + 1];
        if (scaleDistance(b.music, next.music) === 0 || next.music.cycleStart !== next.bar) return;
        pivots++;
        // V of the new key: its root is a fifth above the new tonic
        expect(b.chord.numeral).toMatch(/\//);
        expect(b.chord.pitchClasses[0]).toBe((next.music.tonic + 7) % 12);
        expect(b.chordStart).toBe(true);
    });
    expect(pivots).toBeGreaterThan(3);
});

test('pivots off: the last slot keeps the progression chord', () => {
    const drift = { mode: 'centered', keyChance: 1, modeChance: 0, progressionChance: 0, tempoChance: 0, pivot: false };
    play(generator(5, drift), 64).forEach((b) => expect(b.chord.numeral).not.toMatch(/\//));
});

test('two bars per chord: the pivot fills the whole last slot', () => {
    const drift = { mode: 'centered', keyChance: 1, modeChance: 0, progressionChance: 0, tempoChance: 0, pivot: true };
    const gen = generator(7, drift);
    gen.settings.barsPerChord = 2;
    gen.reset();
    const bars = play(gen, 96);
    bars.filter((b) => b.chord.numeral.includes('/')).forEach((b) => {
        const slotStart = (b.bar - b.music.cycleStart) % 2 === 0;
        const partner = bars.find((o) => o.bar === (slotStart ? b.bar + 1 : b.bar - 1));
        if (partner) expect(partner.chord.name).toBe(b.chord.name);
    });
});

test('tempo glides at most 2 BPM per bar and stays in range', () => {
    const drift = { mode: 'centered', keyChance: 0, modeChance: 0, progressionChance: 0, tempoChance: 1, tempoRange: 10 };
    const bars = play(generator(3, drift), 200);
    bars.slice(1).forEach((b, i) => expect(Math.abs(b.bpm - bars[i].bpm)).toBeLessThanOrEqual(2));
    bars.forEach((b) => {
        expect(b.bpm).toBeGreaterThanOrEqual(62);
        expect(b.bpm).toBeLessThanOrEqual(82);
    });
    expect(new Set(bars.map((b) => b.bpm)).size).toBeGreaterThan(3);
});

test('changing a home setting while playing brings the music home from the next bar', () => {
    const drift = { mode: 'wandering', keyChance: 1, modeChance: 1, progressionChance: 1, tempoChance: 1 };
    const gen = generator(9, drift);
    play(gen, 40);
    gen.transport.timer = 1; // pretend it is running
    gen.set('tonic', 2);
    const next = gen.plan.get(40);
    expect(next.music).toMatchObject({ tonic: 2, mode: 'Major-1', progression: 0, bpm: 72, cycleStart: 40 });
    expect(next.chord.keyName).toBe('D Ionian');
    gen.transport.timer = null;
});

// Drives onBeat like the Transport would (tempo from the plan), returning
// every booked note.
function perform(gen, bars) {
    mockBooked.length = 0;
    gen.transport.beatsPerBar = gen.beatsPerBar;
    let time = 1;
    const downbeats = [];
    for (let beat = 0; beat < bars * gen.beatsPerBar; beat++) {
        const bar = Math.floor(beat / gen.beatsPerBar);
        const beatInBar = beat % gen.beatsPerBar;
        if (beatInBar === 0) downbeats[bar] = time;
        const secondsPerBeat = gen.transport.secondsPerBeat;
        gen.onBeat({ beat, bar, beatInBar, time, secondsPerBeat });
        time += gen.transport.secondsPerBeat;
    }
    return { booked: [...mockBooked], downbeats };
}

test('humanize 0 is exact: no detune, notes on the arranger grid', () => {
    const gen = generator(2, { mode: 'off' });
    gen.settings.humanize = { timing: 0, velocity: 0, detune: 0 };
    gen.reset();
    play(gen, 16).forEach((b) => b.events.forEach((e) => {
        expect(e.detune).toBe(0);
        expect(e.beat * 4).toBe(Math.round(e.beat * 4)); // (a rolled chord strums in sixteenths)
    }));
});

test('humanized timing: some notes early, never before bar 0, at most half a unit', () => {
    const gen = generator(2, { mode: 'off' });
    gen.settings.humanize = { timing: 30, velocity: 0.1, detune: 5 };
    gen.reset();
    const bars = play(gen, 40);
    bars[0].events.forEach((e) => expect(e.beat).toBeGreaterThanOrEqual(0));
    const all = bars.flatMap((b) => b.events);
    expect(all.some((e) => e.beat < 0)).toBe(true);
    all.forEach((e) => expect(e.beat).toBeGreaterThanOrEqual(-0.5));
    expect(new Set(all.map((e) => e.detune)).size).toBeGreaterThan(10);
});

test('every planned note is booked exactly once; early ones before their downbeat', () => {
    const gen = generator(4, { mode: 'centered', tempoChance: 1, tempoRange: 10 });
    gen.sectionDevelopment = false;
    // Keep this scheduling fixture's rhythm, including its early attack.
    gen.formStrategies=false;gen.sectionCurves=false;gen.harmonicDevelopment=false;
    gen.settings.humanize = { timing: 30, velocity: 0.1, detune: 5 };
    gen.reset();
    const { booked, downbeats } = perform(gen, 24);
    const planned = [];
    for (let bar = 0; bar < 23; bar++) {
        const entry = gen.plan.get(bar);
        if (entry) entry.events.forEach((e) => planned.push({ bar, e }));
    }
    planned.forEach(({ e }) => expect(e.booked).toBe(true));
    const early = planned.filter(({ e }) => e.beat < 0);
    expect(early.length).toBeGreaterThan(0);
    early.forEach(({ bar, e }) => {
        const hit = booked.find((n) => n.midi === e.midi && n.detune === e.detune && n.velocity === e.velocity);
        expect(hit.start).toBeLessThan(downbeats[bar]);
        expect(hit.start).toBeGreaterThan(downbeats[bar - 1]);
    });
});

test('6/8: units of eighths, felt tempo in dotted quarters', () => {
    const gen = generator(1, { mode: 'off' });
    gen.set('meter', '6/8');
    expect(gen.beatsPerBar).toBe(6);
    expect(gen.transport.beatsPerBar).toBe(6);
    play(gen, 8).forEach((b) => b.events.forEach((e) => expect(e.beat).toBeLessThan(6)));
    const { downbeats } = perform(gen, 3);
    // 72 BPM at 6/8's pace (0.75): 54 dotted quarters per minute, 2 per bar -> 60/54*2 s per bar
    expect(downbeats[2] - downbeats[1]).toBeCloseTo((60 / (72 * 0.75)) * 2, 5);
});

test('keepCurrent makes the drifted music the new home, without a jump', () => {
    const gen = generator(11, { mode: 'wandering', keyChance: 1, modeChance: 0.5, progressionChance: 1, tempoChance: 1 });
    play(gen, 30);
    gen.position = () => 29 * gen.beatsPerBar; // audible bar 29
    const now = gen.nowPlaying();
    expect(now.keyName).toBe(gen.plan.get(29).chord.keyName);
    gen.transport.timer = 1;
    gen.keepCurrent();
    expect(gen.settings).toMatchObject({ tonic: now.tonic, mode: now.mode, progression: now.progression, bpm: now.bpm });
    expect(gen.plan.get(30).music).toMatchObject({ tonic: now.tonic, mode: now.mode, progression: now.progression });
    gen.transport.timer = null;
});

test('same settings + seed = the same piece; another seed = another piece', () => {
    const notes = (seed) => play(generator(seed, { mode: 'centered', keyChance: 0.5 }), 24)
        .map((b) => b.events.map((e) => [e.role, e.midi, e.beat.toFixed(4)].join()).join('|'));
    expect(notes(21)).toEqual(notes(21));
    expect(notes(21)).not.toEqual(notes(22));
});

test('stop/replay starts the same piece again', () => {
    const gen = generator(5, { mode: 'off' });
    const first = play(gen, 8).map((b) => b.events.map((e) => e.midi).join());
    gen.reset();
    expect(play(gen, 8).map((b) => b.events.map((e) => e.midi).join())).toEqual(first);
});

test('mute and solo: any solo silences the rest; mute silences only its role', () => {
    const gen = generator(1, { mode: 'off' });
    const levels = () => Object.fromEntries(Object.entries(gen.roles).map(([role, r]) => [role, r.gain.gain.value]));
    gen.setRoleMix('bass', { mute: true });
    expect(levels()).toEqual({ pad: 0.8, bass: 0, lead: 0.7, counter: 0.6, perc: 0.7 });
    gen.setRoleMix('lead', { solo: true });
    expect(levels()).toEqual({ pad: 0, bass: 0, lead: 0.7, counter: 0, perc: 0 });
    gen.setRoleMix('bass', { solo: true }); // solo beats mute
    expect(levels()).toEqual({ pad: 0, bass: 0.8, lead: 0.7, counter: 0, perc: 0 });
    gen.setRoleMix('lead', { solo: false });
    gen.setRoleMix('bass', { solo: false });
    gen.setRoleVolume('pad', 0.5);
    expect(levels()).toEqual({ pad: 0.5, bass: 0, lead: 0.7, counter: 0.6, perc: 0.7 });
});

test('stop pauses: Play picks up at the next bar, settings changes keep the place, rewind goes back', () => {
    const gen = generator(4, { mode: 'off' });
    play(gen, 12);
    const notes = (bar) => gen.plan.get(bar).events.map((e) => e.midi).join();
    const bar11 = notes(11);
    gen.pause(10 * gen.beatsPerBar + 1.5); // heard: bar 10
    expect(gen.paused).toBe(true);
    expect(gen.resumeBar).toBe(11);
    expect(gen.position()).toBe(11 * gen.beatsPerBar);
    expect(notes(11)).toBe(bar11);
    expect(gen.plan.get(11).events.every((e) => !e.booked)).toBe(true);
    gen.set('leadActivity', 0.2);
    expect(gen.resumeBar).toBe(11);
    expect(gen.plan.has(10)).toBe(true);
    gen.rewind();
    expect(gen.paused).toBe(false);
    expect(gen.position()).toBe(0);
});

test('a phrase is a piece: same phrase and settings, same notes from the start - also after edits and a rewind', async () => {
    const { phraseToSeed } = await import('./phrase');
    const notes = (gen) => play(gen, 48).map((b) => b.events.map((e) => `${e.role}${e.midi}@${e.beat.toFixed(3)}`).join()).join('|');
    const make = () => {
        const gen = new Generator();
        gen.setMany({ seed: phraseToSeed('rainy sunday'), sections: { mode: 'strong', phrases: 2 }, counter: { mode: 'answer', activity: 0.6 } });
        return gen;
    };
    const first = notes(make());
    expect(notes(make())).toBe(first);
    const edited = make();
    play(edited, 6);
    edited.pause(5 * edited.beatsPerBar);
    edited.set('leadActivity', 0.1);
    expect(edited.editedSinceStart).toBe(true);
    edited.set('leadActivity', 0.6);
    edited.rewind();
    expect(edited.editedSinceStart).toBe(false);
    expect(notes(edited)).toBe(first);
});

test('stepping: by chord and by progression; forward keeps the place, back goes to the start first', () => {
    const gen = generator(6, { mode: 'off' });
    gen.set('barsPerChord', 2); // 4 chords of 2 bars: cycles of 8 bars
    play(gen, 40);
    const notes = (bar) => gen.plan.get(bar).events.map((e) => e.midi).join();
    const bar5 = notes(5);
    gen.pause(20 * gen.beatsPerBar);
    gen.seek(5);
    expect(gen.hereBar).toBe(5);
    expect(notes(5)).toBe(bar5); // back plays what was planned
    gen.step('progression', 1); // bar 5 of cycle 0..7 -> bar 5 of 8..15
    expect(gen.hereBar).toBe(13);
    gen.step('chord', 1); // second bar of chord 12..13 -> second bar of 14..15
    expect(gen.hereBar).toBe(15);
    gen.step('chord', -1); // inside a chord: its start
    expect(gen.hereBar).toBe(14);
    gen.step('chord', -1); // at its start: the chord before
    expect(gen.hereBar).toBe(12);
    gen.step('progression', -1); // inside a cycle: its start
    expect(gen.hereBar).toBe(8);
    gen.step('progression', -1); // at its start: the one before
    expect(gen.hereBar).toBe(0);
    gen.seek(-3);
    expect(gen.hereBar).toBe(0);
});

test('looping: a bar or a progression; a settings change re-plans the loop at its next pass', () => {
    const gen = generator(6, { mode: 'off' });
    play(gen, 10);
    gen.pause(5 * gen.beatsPerBar);
    gen.setLoop('progression');
    expect(gen.loop).toMatchObject({ from: 4, to: 7 });
    gen.setLoop('chord');
    expect(gen.loop).toMatchObject({ from: 6, to: 6 });
    gen.plan.get(6).events.forEach((e) => { e.booked = true; });
    const before = gen.plan.get(6).events.map((e) => e.midi).join();
    gen.loopBack();
    expect(gen.plan.get(6).events.every((e) => !e.booked)).toBe(true);
    expect(gen.plan.get(6).events.map((e) => e.midi).join()).toBe(before);
    gen.set('padNotes', 4);
    gen.loopBack();
    expect(gen.plan.get(6).events.filter((e) => e.role === 'pad').length).toBeGreaterThan(0);
    expect(gen.plan.get(6).state.padVoicing.length).toBe(4);
    gen.setLoop('off');
    expect(gen.loop).toBeNull();
});

describe('drums, swing and section tone', () => {
    const notes = (bars) => bars.flatMap((b) => b.events.filter((e) => e.role !== 'perc').map(({ role, midi, beat, velocity }) => ({ bar: b.bar, role, midi, beat, velocity })));
    const withSettings = (patch) => {
        const gen = generator(31, { mode: 'centered' });
        Object.assign(gen.settings, patch);
        gen.reset();
        return play(gen, 24);
    };

    test('turning drums on adds hits and leaves every note as it was', () => {
        const plain = withSettings({});
        ['heartbeat', 'brushes', 'lofi', 'shaker', 'downtempo'].forEach((style) => {
            const drummed = withSettings({ drums: { style, activity: 0.8 } });
            expect(notes(drummed)).toEqual(notes(plain));
            const hits = drummed.flatMap((b) => b.events.filter((e) => e.role === 'perc'));
            expect(hits.length).toBeGreaterThan(0);
            hits.forEach((e) => {
                expect(e.beat).toBeGreaterThanOrEqual(0);
                expect(e.beat).toBeLessThan(4.1);
                expect(e.midi).toBeGreaterThanOrEqual(0);
                expect(e.midi).toBeLessThan(9);
            });
        });
        expect(plain.flatMap((b) => b.events).some((e) => e.role === 'perc')).toBe(false);
    });

    test('sections thin the drums out: a strong intro has none', () => {
        const bars = withSettings({ drums: { style: 'lofi', activity: 0.5 }, sections: { mode: 'strong', phrases: 2 } });
        bars.filter((b) => b.state.phrase.section.type === 'intro').forEach((b) => expect(b.events.some((e) => e.role === 'perc')).toBe(false));
        expect(bars.some((b) => b.state.phrase.section.type === 'full' && b.events.some((e) => e.role === 'perc'))).toBe(true);
    });

    test('swing delays only off-beat halves, toward the triplet', () => {
        const straight = withSettings({ humanize: { timing: 0, velocity: 0, detune: 0 }, drums: { style: 'lofi', activity: 0.5 } });
        const swung = withSettings({ humanize: { timing: 0, velocity: 0, detune: 0 }, drums: { style: 'lofi', activity: 0.5 }, swing: 0.6 });
        straight.forEach((b, i) => b.events.forEach((e, j) => {
            const s = swung[i].events[j];
            const offBeat = Math.abs(e.beat - Math.floor(e.beat) - 0.5) < 1e-9;
            expect(s.beat).toBeCloseTo(offBeat ? e.beat + 0.1 : e.beat, 9);
        }));
    });

    test('section tone: darker in intros, open in full; open when off', () => {
        const bars = withSettings({ sectionTone: true, sections: { mode: 'gentle', phrases: 2 } });
        bars.forEach((b) => {
            if (b.state.phrase.section.type === 'full') expect(b.tone).toBeGreaterThan(2000);
            if (b.state.phrase.section.type === 'intro') expect(b.tone).toBeLessThan(5000);
        });
        withSettings({ sections: { mode: 'gentle', phrases: 2 } }).forEach((b) => expect(b.tone).toBe(20000));
    });
});

test('an ending: V, then a held I, then silence; Stop before the end carries on instead', () => {
    const gen = generator(12, { mode: 'off' });
    gen.settings.drums = { style: 'brushes', activity: 0.5 };
    play(gen, 10);
    gen.transport.timer = 1;
    gen.endSoon();
    const v = gen.plan.get(10);
    const final = gen.plan.get(11);
    expect(v.chord.numeral).toMatch(/^V/);
    expect(final.chord.numeral).toMatch(/^I/);
    expect(final.chord.keyName).toBe('C Ionian');
    const pad = final.events.filter((e) => e.role === 'pad');
    expect(pad.length).toBe(3);
    pad.forEach((e) => expect(e.length).toBeGreaterThan(gen.beatsPerBar));
    expect(final.events.filter((e) => e.role === 'bass').length).toBe(1);
    expect(final.events.filter((e) => e.role === 'perc').length).toBe(1);
    gen.ensurePlanned(12);
    expect(gen.plan.get(12).events).toEqual([]);
    expect(gen.ending).toBe(true);
    gen.stop();
    expect(gen.ending).toBe(false);
    expect([...gen.plan.values()].some((planned) => planned.ending)).toBe(false);
});

describe('library presets as the generator plays them', () => {
    // imported late: the module mocks above have to be in place first
    test('every music preset plans a long stretch: notes in every voice that plays, finite times, the tempo it names', async () => {
        const { SCENES, sceneSettings, sceneGroup } = await import('./scenes');
        SCENES.filter((scene) => sceneGroup(scene) !== 'ambience').forEach((scene) => {
            const gen = new Generator();
            // (the ambience engine isn't stubbed here)
            const { ambience, ambienceShape, ambienceVolume, playAmbience, ...music } = sceneSettings(scene, 11);
            gen.setMany(music);
            gen.reset();
            const bars = play(gen, 40);
            bars.forEach((b) => {
                expect(b.bpm).toBe(scene.settings.bpm ?? 72);
                b.events.forEach((e) => {
                    expect(Number.isFinite(e.beat) && Number.isFinite(e.length) && Number.isFinite(e.midi) && Number.isFinite(e.velocity)).toBe(true);
                });
            });
            expect(bars.flatMap((b) => b.events).filter((e) => e.role === 'bass').length).toBeGreaterThan(20);
            expect(bars.flatMap((b) => b.events).filter((e) => e.role === 'pad').length).toBeGreaterThan(20);
        });
    });
});

describe('sounds that change with a preset', () => {
    test('while playing, a new sound waits for the next bar line; stopped, it is loaded at once', () => {
        const gen = new Generator();
        gen.reset();
        const loaded = [];
        gen.roles.pad.instrument.applyPreset = (preset) => loaded.push(preset.tag);
        // stopped: at once
        let applied = 0;
        gen.loadRolePresetAtBar('pad', 'A', { tag: 'A' }, () => applied++);
        expect(loaded).toEqual(['A']);
        expect(applied).toBe(1);
        // playing: waits for a first beat
        gen.transport.timer = 1;
        gen.loadRolePresetAtBar('pad', 'B', { tag: 'B' }, () => applied++);
        gen.loadRolePresetAtBar('pad', 'C', { tag: 'C' }, () => applied++);
        expect(loaded).toEqual(['A']);
        gen.onBeat({ bar: 1, beatInBar: 2, time: 0, secondsPerBeat: 0.5 });
        expect(loaded).toEqual(['A']);
        gen.onBeat({ bar: 2, beatInBar: 0, time: 1, secondsPerBeat: 0.5 });
        expect(loaded).toEqual(['A', 'C']);
        expect(gen.roles.pad.presetName).toBe('C');
        expect(applied).toBe(2);
        gen.transport.timer = null;
    });

    test('a sound loaded directly replaces one that was waiting, and stopping loads what waits', () => {
        const gen = new Generator();
        gen.reset();
        const loaded = [];
        gen.roles.bass.instrument.applyPreset = (preset) => loaded.push(preset.tag);
        gen.transport.timer = 1;
        gen.loadRolePresetAtBar('bass', 'B', { tag: 'B' });
        gen.loadRolePreset('bass', 'D', { tag: 'D' });
        gen.flushPendingVoices();
        expect(loaded).toEqual(['D']);
        gen.loadRolePresetAtBar('bass', 'E', { tag: 'E' });
        gen.flushPendingVoices();
        expect(loaded).toEqual(['D', 'E']);
        gen.transport.timer = null;
    });
});

describe('the short intro', () => {
    const sectionsOf = (gen, bars) => { gen.planThrough(bars); return [...Array(bars).keys()].map((b) => gen.plan.get(b).state.phrase.section.type); };

    test('the intro lasts one phrase and goes straight to Full; the drums know where it ends', () => {
        const gen = new Generator({ ...defaultSettings(), sections: { mode: 'strong', phrases: 4 } });
        gen.reset();
        const long = sectionsOf(gen, 64);
        const introBars=gen.plan.get(0).state.phrase.section.bars;
        expect(introBars).toBeGreaterThanOrEqual(4);
        expect(long.slice(0, introBars).every((t) => t === 'intro')).toBe(true);
        expect(long[introBars]).toBe('build');
        gen.setQuickIntro(true);
        const quick = sectionsOf(gen, 20);
        expect(quick.slice(0, 4)).toEqual(['intro', 'intro', 'intro', 'intro']);
        expect(quick.slice(4, 8).every((t) => t === 'full')).toBe(true);
        expect(gen.plan.get(0).state.phrase.section.bars).toBe(4);
        gen.setQuickIntro(false);
        const restored=sectionsOf(gen,64),restoredLength=gen.plan.get(0).state.phrase.section.bars;
        expect(gen.quickIntro).toBe(false);
        expect(restored.slice(0,restoredLength).every(t=>t==='intro')).toBe(true);
    });

    test('with sections off nothing changes', () => {
        const gen = new Generator({ ...defaultSettings(), sections: { mode: 'off', phrases: 4 } });
        gen.reset();
        gen.setQuickIntro(true);
        gen.planThrough(6);
        expect(gen.plan.get(0).state.phrase.section).toBeNull();
    });
});

describe('changing at the next chord', () => {
    // the last beat of a bar that is followed by the start of a chord
    const beforeChord = (gen) => {
        gen.planThrough(12);
        const bar = [...gen.plan.keys()].find((b) => b >= 1 && gen.plan.get(b + 1) && gen.plan.get(b + 1).chordStart);
        return { bar, beat: gen.transport.beatsPerBar - 1 };
    };

    test('a change waits for the last beat before a chord; stopped, it happens at once', () => {
        const gen = new Generator();
        gen.reset();
        let ran = 0;
        gen.atNextChord(() => ran++);
        expect(ran).toBe(1);
        gen.transport.timer = 1;
        const { bar, beat } = beforeChord(gen);
        gen.atNextChord(() => ran++);
        gen.onBeat({ bar, beatInBar: beat - 1, time: 0, secondsPerBeat: 0.5 });
        expect(ran).toBe(1);
        gen.onBeat({ bar, beatInBar: beat, time: 1, secondsPerBeat: 0.5 });
        expect(ran).toBe(2);
        gen.onBeat({ bar: bar + 1, beatInBar: 0, time: 2, secondsPerBeat: 0.5 });
        expect(ran).toBe(2);
        gen.transport.timer = null;
    });

    test('a waiting change can be run early (stopping does), once', () => {
        const gen = new Generator();
        gen.reset();
        gen.transport.timer = 1;
        let ran = 0;
        gen.atNextChord(() => ran++);
        expect(ran).toBe(0);
        gen.runPendingChange();
        gen.runPendingChange();
        expect(ran).toBe(1);
        gen.transport.timer = null;
    });

    test('sounds that morph glide over the chord that starts, others switch', () => {
        const gen = new Generator();
        gen.reset();
        gen.transport.timer = 1;
        const calls = [];
        gen.roles.pad.instrument.morphTo = (preset, seconds) => calls.push(['morph', preset.tag, seconds]);
        gen.roles.pad.instrument.applyPreset = (preset) => calls.push(['apply', preset.tag]);
        gen.roles.bass.instrument.applyPreset = (preset) => calls.push(['apply', preset.tag]);
        const { bar } = beforeChord(gen);
        const start = bar + 1;
        const { start: from, end } = gen.chordOf(start);
        gen.loadRolePresetAtBar('pad', 'P', { tag: 'P' }, undefined, { morph: true });
        gen.loadRolePresetAtBar('bass', 'B', { tag: 'B' });
        gen.onBeat({ bar: start, beatInBar: 0, time: 0, secondsPerBeat: 0.5 });
        const seconds = (end - from + 1) * gen.beatsPerBar * 0.5;
        expect(calls).toContainEqual(['morph', 'P', seconds]);
        expect(calls).toContainEqual(['apply', 'B']);
        gen.transport.timer = null;
    });
});

describe('the audio clock behind the playhead', () => {
    test('steps of a big output buffer do not make it jump: it advances evenly, close to the true time', () => {
        const gen = new Generator();
        const wall = vi.spyOn(performance, 'now');
        const BUFFER = 0.2;
        const readings = [];
        for (let frame = 0; frame < 300; frame++) {
            const t = 10 + frame * 0.016; // a 60 fps page
            wall.mockReturnValue(t * 1000);
            gen.AC.currentTime = Math.floor(t / BUFFER) * BUFFER; // the audio clock moves in whole buffers
            readings.push({ t, clock: gen.audioClock() });
        }
        wall.mockRestore();
        const settled = readings.slice(30);
        settled.slice(1).forEach(({ clock }, i) => {
            const step = clock - settled[i].clock;
            expect(step).toBeGreaterThanOrEqual(0);
            expect(step).toBeLessThan(0.03); // never a buffer-sized jump
        });
        // and not drifting away from the real time
        settled.forEach(({ t, clock }) => expect(Math.abs(clock - t)).toBeLessThan(BUFFER + 0.01));
    });

    test('a jump of the audio clock (a seek, a suspended context) starts it over', () => {
        const gen = new Generator();
        const wall = vi.spyOn(performance, 'now');
        wall.mockReturnValue(5000);
        gen.AC.currentTime = 5;
        gen.audioClock();
        wall.mockReturnValue(5016);
        gen.AC.currentTime = 20;
        expect(gen.audioClock()).toBe(20);
        wall.mockRestore();
    });
});

describe('chord colour and borrowed chords', () => {
    const chordsOf = (patch) => {
        const gen = generator(31, { mode: 'centered' });
        Object.assign(gen.settings, { tonic: 9, mode: 'Major-6', progression: 8, barsPerChord: 1 }, patch);
        gen.reset();
        return play(gen, 8).map((b) => gen.plan.get(b.bar).chord.name);
    };

    test('plain by default; always-floating chords are all suspended', () => {
        expect(chordsOf({}).every((name) => !name.includes('sus'))).toBe(true);
        expect(chordsOf({ chordColour: { mode: 'floating', amount: 1 } }).every((name) => name.includes('sus'))).toBe(true);
    });

    test('a share of chords is coloured, the same ones every time', () => {
        const half = chordsOf({ chordColour: { mode: 'sus2', amount: 0.5 } });
        expect(half).toEqual(chordsOf({ chordColour: { mode: 'sus2', amount: 0.5 } }));
        expect(half.filter((name) => name.includes('sus2')).length).toBeGreaterThan(0);
        expect(half.filter((name) => !name.includes('sus2')).length).toBeGreaterThan(0);
    });

    test('borrowing in a minor key swaps in the major IV (i - iv - VI - v: Dm becomes D)', () => {
        const plain = chordsOf({});
        const borrowed = chordsOf({ chordBorrow: 1 });
        expect(plain.slice(0, 4)).toEqual(['Am', 'Dm', 'F', 'Em']);
        expect(borrowed.slice(0, 4)).toEqual(['Am', 'D', 'F', 'E']);
    });
});

test('Original generation reference fixtures', () => {
    const fingerprint = value => {
        let h = 2166136261;
        for (const c of JSON.stringify(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
        return (h >>> 0).toString(16);
    };
    const fixtures = ['4/4', '3/4', '6/8'].map((meter, index) => {
        const gen = new Generator({ ...defaultSettings(), generation: 'legacy', seed: 1234 + index, meter,
            drums: { style: 'lofi', activity: 0.5, variation: 0.5, sprinkle: 0.35, kit: 'felt' }, sections: { mode: 'strong', phrases: 2 } });
        return fingerprint(play(gen, 48).map(b => ({ events: b.events, chord: b.chord, section: b.state.phrase.section })));
    });
    // (6/8 changed with its pace, meter.js)
    expect(fixtures).toEqual(['5b9bc750', 'ed5448a7', '692f3d06']);
});

test('Latest plans and offline planners agree, remain distinct from Original, and ignore drum enablement', () => {
    const settings={...defaultSettings(), seed:90210, leadActivity:1, humanize:{timing:0,velocity:0,detune:0}};
    const latest=new Generator(settings);
    const original=new Generator({...settings,generation:'legacy'});
    const latestBars=play(latest,32);
    const copied=latest.planner();
    const offline=[];for(let bar=0;bar<32;bar++){copied.planBar(bar);offline.push(copied.plan.get(bar));}
    expect(offline.map(b=>b.events)).toEqual(latestBars.map(b=>b.events));
    expect(play(original,32).map(b=>b.events)).not.toEqual(latestBars.map(b=>b.events));
    const drums=new Generator({...settings,drums:{style:'lofi',activity:.6,variation:.5,sprinkle:.35,kit:'felt'}});
    expect(play(drums,32).map(b=>b.events.filter(e=>e.role!=='perc'))).toEqual(latestBars.map(b=>b.events));
});

test('per-note expression preserves written events, follows planner copies and stays out of Original', () => {
    const settings={...defaultSettings(),seed:42,leadActivity:1,sections:{mode:'off',phrases:4}};
    const g=new Generator(settings),expressive=g.planner(),plain=g.planner({noteExpression:false,noteConnection:false,gateEnvelopes:false});
    let count=0;
    for(let bar=0;bar<16;bar++){
        expressive.planBar(bar);plain.planBar(bar);
        const events=expressive.plan.get(bar).events;
        count+=events.filter(e=>e.expression).length;
        expect(events.map(({expression,...e})=>e)).toEqual(plain.plan.get(bar).events);
    }
    expect(count).toBeGreaterThan(0);expect(plain.planner().noteExpression).toBe(false);
    const original=new Generator({...settings,generation:'legacy'}).planner();original.planBar(0);
    expect(original.plan.get(0).events.every(e=>!e.expression)).toBe(true);
});

test('previous Latest reference for ensemble comparisons', () => {
    const fingerprints=['4/4','6/8'].map((meter,i)=>{
        const gen=new Generator({...defaultSettings(),generation:'latest',seed:741+i,meter,leadActivity:.8,drums:{style:'lofi',activity:.5,variation:.5,sprinkle:.35,kit:'felt'}});
        gen.registerLevel=false;gen.gateEnvelopes=false;gen.noteConnection=false;gen.heldExpression=false;gen.noteExpression=false;gen.rhythmGrammar=false;gen.ensembleCoordination=false;gen.formDevelopment=false;gen.themeDevelopment=false;gen.phraseSearch=false;gen.longPhrases=false;gen.contrastPhrases=false;gen.padVariation=false;gen.reset();
        let h=2166136261;for(const c of JSON.stringify(play(gen,32).map(b=>b.events)))h=Math.imul(h^c.charCodeAt(0),16777619);
        return(h>>>0).toString(16);
    });
    // (6/8 changed with its pace, meter.js)
    expect(fingerprints).toEqual(['8ddcde1','2ecfd48d']);
});

test('ensemble coordination preserves the theme, serialises rhythm, and survives offline planning', () => {
    const settings={...defaultSettings(),seed:741,leadActivity:1,leadDensity:.6,counter:{mode:'line',activity:.7},humanize:{timing:0,velocity:0,detune:0},
        bassWeights:{whole:0,half:0,walking:1,drive:0},padWeights:{sustain:0,pulse:1,arpeggio:0,sequence:0,rolled:0,stacked:0}};
    const coordinated=new Generator(settings), previous=new Generator(settings);
    coordinated.jointCounterpoint=false;coordinated.duetInteraction=false;coordinated.reset();
    previous.ensembleCoordination=false;previous.reset();
    const a=play(coordinated,32),b=play(previous,32);
    const lead=bars=>bars.map(bar=>bar.events.filter(e=>e.role==='lead'));
    expect(lead(a)).toEqual(lead(b));
    expect(a.map(bar=>bar.events.filter(e=>e.role==='bass'))).not.toEqual(b.map(bar=>bar.events.filter(e=>e.role==='bass')));
    expect(a[0].state.composition.rhythm).toEqual(JSON.parse(JSON.stringify(a[0].state.composition.rhythm)));
    const copied=coordinated.planner(),offline=[];
    for(let bar=0;bar<32;bar++){copied.planBar(bar);offline.push(copied.plan.get(bar).events);}
    expect(offline).toEqual(a.map(bar=>bar.events));
    expect(previous.planner().ensembleCoordination).toBe(false);
});

test('duet memory survives restore and silence, copies offline, respects off/harmony and percussion independence',()=>{
    const settings={...defaultSettings(),seed:42,leadActivity:1,leadRepeat:0,counter:{mode:'line',activity:1},sections:{mode:'off',phrases:4},
        humanize:{timing:0,velocity:0,detune:0}};
    const gen=new Generator(settings);gen.phraseLength=4;gen.reset();
    const bars=play(gen,32),offline=gen.planner();
    for(let bar=0;bar<32;bar++)offline.planBar(bar);
    expect([...offline.plan.values()]).toEqual(bars);
    expect(new Set(bars.map(b=>b.state.composition.duet?.mode))).toEqual(new Set(['establish','lead moves','contrary motion','together','counter moves']));
    expect(bars[31].state.composition.duetMemory.flat().length).toBeGreaterThan(0);
    const saved=JSON.parse(JSON.stringify(offline.plan.get(15)));
    for(const bar of [...offline.plan.keys()])if(bar>15)offline.plan.delete(bar);
    offline.plan.set(15,saved);for(let bar=16;bar<32;bar++)offline.planBar(bar);
    expect([...offline.plan.values()]).toEqual(bars);
    const noDrums=new Generator({...settings,drums:{...settings.drums,style:'off'}});noDrums.phraseLength=4;noDrums.reset();
    expect(play(noDrums,32).map(b=>b.events.filter(e=>e.role!=='perc'))).toEqual(bars.map(b=>b.events.filter(e=>e.role!=='perc')));
    for(const mode of ['off','harmony']){
        const a=new Generator({...settings,counter:{mode,activity:1}}),b=new Generator({...settings,counter:{mode,activity:1}});
        b.duetInteraction=false;b.reset();expect(play(a,16).map(x=>x.events)).toEqual(play(b,16).map(x=>x.events));
    }
    gen.set('leadActivity',0);gen.planThrough(36);
    expect(gen.plan.get(35).events.filter(e=>e.role==='lead')).toEqual([]);
    expect(gen.planner({duetInteraction:false}).duetInteraction).toBe(false);
});


test('developed form restores identical plans, copies review and quick-intro choices, and ends coherently', () => {
    const settings = { ...defaultSettings(), seed: 42, sectionTone: true, sections: { mode: 'strong', phrases: 2 } };
    const gen = new Generator(settings);
    const bars = play(gen, 64), offline = gen.planner();
    for (let bar = 0; bar < 64; bar++) offline.planBar(bar);
    expect([...offline.plan.values()]).toEqual(bars);
    const saved = JSON.parse(JSON.stringify(offline.plan.get(31)));
    for (const bar of [...offline.plan.keys()]) if (bar > 31) offline.plan.delete(bar);
    offline.plan.set(31, saved);
    for (let bar = 32; bar < 64; bar++) offline.planBar(bar);
    expect([...offline.plan.values()]).toEqual(bars);
    const boundaries = bars.filter((b, i) => b.state.phrase.section.start === i && i > 0);
    boundaries.forEach(b => expect(b.tone).toBeCloseTo(bars[b.bar - 1].tone, 8));
    offline.endBar = 64;
    for (let bar = 64; bar < 68; bar++) offline.planBar(bar);
    expect(offline.plan.get(64).ending).toBe(true);
    expect(offline.plan.get(64).chord.numeral).toBe('I');
    expect(offline.plan.get(66).events).toEqual([]);
    gen.formDevelopment = false; gen.quickIntro = true;
    const previous = gen.planner(); expect(previous.formDevelopment).toBe(false); expect(previous.quickIntro).toBe(true);
    previous.planBar(0); expect(previous.plan.get(0).state.phrase.section.bars).toBe(4);
    gen.formDevelopment = true;
    const quick = gen.planner(); for (let bar = 0; bar < 5; bar++) quick.planBar(bar);
    expect(quick.plan.get(4).state.phrase.section.type).toBe('full');
});


test('named string patches follow generation mode while edited or explicit sounds remain intact', () => {
    const gen=new Generator({...defaultSettings(),generation:'latest'}),loaded=[];
    gen.roles.pad.instrument.applyPreset=preset=>loaded.push(preset);
    gen.loadRolePreset('pad','Harp Pluck');
    expect(loaded.at(-1).stringModel).toBe('plucked');
    gen.set('generation','legacy');
    expect(loaded.at(-1).stringModel).toBeUndefined();
    gen.set('generation','latest');expect(loaded.at(-1).stringModel).toBe('plucked');
    gen.roles.pad.edited=true;const count=loaded.length;
    gen.set('generation','legacy');expect(loaded).toHaveLength(count);
    gen.loadRolePreset('pad','Harp Pluck',{stringModel:'plucked',stringDamping:.95});
    gen.set('generation','latest');gen.set('generation','legacy');
    expect(loaded.at(-1).stringDamping).toBe(.95);
    expect(gen.roles.pad.stringPatchBase).toBeNull();
});


test('named piano patches follow generation mode, preserve edits, and leave Pixel Piano distinct', () => {
    const gen=new Generator({...defaultSettings(),generation:'latest'}),loaded=[];
    gen.roles.pad.instrument.applyPreset=preset=>loaded.push(preset);
    for(const name of ['Felt Keys','Soft Keys','Tine Keys','FM Rhodes']){
        gen.loadRolePreset('pad',name);expect(loaded.at(-1).stringModel).toBe('piano');
        gen.set('generation','legacy');expect(loaded.at(-1).stringModel).toBeUndefined();
        gen.set('generation','latest');expect(loaded.at(-1).stringModel).toBe('piano');
    }
    gen.roles.pad.edited=true;const count=loaded.length;gen.set('generation','legacy');expect(loaded).toHaveLength(count);
    gen.loadRolePreset('pad','Felt Keys',{stringModel:'piano',pianoBrightness:.92});gen.set('generation','latest');gen.set('generation','legacy');
    expect(loaded.at(-1).pianoBrightness).toBe(.92);
    gen.set('generation','latest');gen.loadRolePreset('pad','Pixel Piano');expect(loaded.at(-1).stringModel).toBeUndefined();
});

test('classic piano patches remain oscillator voices through generation changes',()=>{
    const gen=new Generator({...defaultSettings(),generation:'latest'}),loaded=[];
    gen.roles.pad.instrument.applyPreset=p=>loaded.push(p);
    for(const name of ['Felt Keys','Soft Keys','Tine Keys','FM Rhodes']){
        gen.loadRolePreset('pad',name+' (classic)');expect(loaded.at(-1).stringModel).toBe('oscillator');
        expect(gen.roles.pad.stringPatchBase).toBeNull();
        gen.set('generation','legacy');gen.set('generation','latest');expect(loaded.at(-1).stringModel).toBe('oscillator');
    }
});

test('phrase performance changes only performance, keeps zero exact and copies into offline planners',()=>{
    const settings={...defaultSettings(),seed:123,leadActivity:1,humanize:{velocity:.15,timing:20,detune:3}};
    const phrased=new Generator(settings),independent=new Generator(settings);independent.phrasePerformance=false;independent.reset();
    const a=play(phrased,24),b=play(independent,24),identity=bars=>bars.map(b=>b.events.map(e=>[e.role,e.midi,e.length,e.detune]));
    expect(identity(a)).toEqual(identity(b));expect(a.map(b=>b.events)).not.toEqual(b.map(b=>b.events));
    expect(a[0].state.composition.performance).toEqual(JSON.parse(JSON.stringify(a[0].state.composition.performance)));
    const offline=phrased.planner();for(let bar=0;bar<24;bar++)offline.planBar(bar);expect([...offline.plan.values()]).toEqual(a);
    const saved=JSON.parse(JSON.stringify(offline.plan.get(11)));for(let bar=12;bar<24;bar++)offline.plan.delete(bar);offline.plan.set(11,saved);
    for(let bar=12;bar<24;bar++)offline.planBar(bar);expect([...offline.plan.values()]).toEqual(a);
    expect(independent.planner().phrasePerformance).toBe(false);
    const exact={...settings,humanize:{velocity:0,timing:0,detune:0}},x=new Generator(exact),y=new Generator(exact);y.phrasePerformance=false;y.reset();
    expect(play(x,8).map(b=>b.events)).toEqual(play(y,8).map(b=>b.events));
});

test('theme development survives planning/restore, remains independent of percussion and pins comparison baselines',()=>{
    const settings={...defaultSettings(),seed:42,leadActivity:1,leadDensity:.75,sections:{mode:'off',phrases:4},humanize:{timing:0,velocity:0,detune:0}};
    const gen=new Generator(settings),bars=play(gen,32),offline=gen.planner();for(let bar=0;bar<32;bar++)offline.planBar(bar);expect([...offline.plan.values()]).toEqual(bars);
    const saved=JSON.parse(JSON.stringify(offline.plan.get(7)));for(let bar=8;bar<32;bar++)offline.plan.delete(bar);offline.plan.set(7,saved);for(let bar=8;bar<32;bar++)offline.planBar(bar);expect([...offline.plan.values()]).toEqual(bars);
    const muted=new Generator({...settings,drums:{...settings.drums,style:'off'}}),line=bs=>bs.map(b=>b.events.filter(e=>e.role==='lead'));
    expect(line(play(muted,32))).toEqual(line(bars));
    gen.themeDevelopment=false;const reference=gen.planner();expect(reference.themeDevelopment).toBe(false);for(let bar=0;bar<16;bar++)reference.planBar(bar);
    expect(reference.plan.get(6).state.composition.development).toBeUndefined();
    expect(line([...reference.plan.values()])).not.toEqual(line(bars.slice(0,16)));
});

test('phrase search uses decided harmony, preserves rhythms, restores and copies comparison choices',()=>{
    const settings={...defaultSettings(),seed:42,leadActivity:1,leadDensity:.75,sections:{mode:'off',phrases:4},humanize:{timing:0,velocity:0,detune:0},drift:{...defaultSettings().drift,mode:'off'}};
    const gen=new Generator(settings),reference=new Generator(settings);gen.rhythmGrammar=false;reference.rhythmGrammar=false;gen.registerLevel=false;reference.registerLevel=false;gen.noteResolution=false;gen.reset();reference.noteResolution=false;reference.phraseSearch=false;reference.reset();
    const bars=play(gen,32),old=play(reference,32),rhythm=bs=>bs.map(b=>b.events.filter(e=>e.role==='lead').map(e=>[e.beat,e.length,e.velocity]));
    expect(rhythm(bars)).toEqual(rhythm(old));expect(bars.map(b=>b.events)).not.toEqual(old.map(b=>b.events));
    const offline=gen.planner();for(let bar=0;bar<32;bar++)offline.planBar(bar);expect([...offline.plan.values()]).toEqual(bars);
    const saved=JSON.parse(JSON.stringify(offline.plan.get(7)));for(let bar=8;bar<32;bar++)offline.plan.delete(bar);offline.plan.set(7,saved);for(let bar=8;bar<32;bar++)offline.planBar(bar);expect([...offline.plan.values()]).toEqual(bars);
    for(const b of bars.slice(0,28))for(const forecast of gen.melodyHarmony(b.bar,b.music,b.upcoming))expect(forecast.chord).toEqual(bars[forecast.bar].chord);
    expect(reference.planner().phraseSearch).toBe(false);
    const pivot=new Generator({...settings,barsPerChord:1,drift:{...settings.drift,mode:'wandering',pivot:true}});
    const p=play(pivot,1)[0],out=pivot.melodyHarmony(0,p.music,p.upcoming,100),end=p.music.cycleStart+PROGRESSIONS[p.music.progression].length;
    expect(out.at(-1).bar).toBeLessThan(end+PROGRESSIONS[p.upcoming.progression].length-1);
});

test('rhythm grammar retains seeded gestures and ties through offline copies and serialised restore',()=>{
    const settings={...defaultSettings(),seed:42,leadActivity:1,leadDensity:.75,sections:{mode:'off',phrases:4},humanize:{timing:0,velocity:0,detune:0}};
    const g=new Generator(settings);g.phraseLength=8;g.reset();const bars=play(g,32),copy=g.planner();
    for(let bar=0;bar<32;bar++)copy.planBar(bar);
    expect([...copy.plan.values()]).toEqual(bars);
    expect(bars[0].state.composition.grammar.operations).toHaveLength(8);
    expect(bars.flatMap(b=>b.state.composition.melody?.ties??[]).length).toBeGreaterThan(0);
    const saved=JSON.parse(JSON.stringify(copy.plan.get(5)));for(let bar=6;bar<32;bar++)copy.plan.delete(bar);copy.plan.set(5,saved);
    for(let bar=6;bar<32;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual(bars);
    expect(g.planner({rhythmGrammar:false}).rhythmGrammar).toBe(false);
});

test('active independent counter has phrase breaths without erasing motif memory or changing the lead',()=>{
    const settings={...defaultSettings(),seed:42,leadActivity:1,counter:{mode:'line',activity:1},sections:{mode:'off',phrases:4},humanize:{timing:0,velocity:0,detune:0}};
    const gen=new Generator(settings),before=new Generator(settings);gen.phraseLength=4;before.phraseLength=4;before.partRhythmGrammar=false;gen.reset();before.reset();
    const bars=play(gen,16),old=play(before,16),lead=bs=>bs.map(b=>b.events.filter(e=>e.role==='lead'));
    expect(lead(bars)).toEqual(lead(old));
    const rest=bars[0].state.composition.partGrammar.counterRest;
    expect(bars[rest].events.filter(e=>e.role==='counter')).toEqual([]);
    expect(bars[rest].state.composition.duetMemory.flat().length).toBeGreaterThan(0);
    expect(bars.slice(rest+1).some(b=>b.events.some(e=>e.role==='counter'))).toBe(true);
    const copy=gen.planner();for(let bar=0;bar<16;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual(bars);
    const saved=JSON.parse(JSON.stringify(copy.plan.get(rest)));for(let bar=rest+1;bar<16;bar++)copy.plan.delete(bar);copy.plan.set(rest,saved);
    for(let bar=rest+1;bar<16;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual(bars);
    expect(gen.planner({partRhythmGrammar:false}).partRhythmGrammar).toBe(false);
});

test('instrument groove snapshots actual voices, restores and copies offline choices, refreshing at a phrase entrance',()=>{
    const settings={...defaultSettings(),seed:42,leadActivity:1,sections:{mode:'off',phrases:4},humanize:{timing:20,velocity:.1,detune:0}};
    const g=new Generator(settings);g.roles.lead.presetName='Custom';g.roles.lead.instrument.preset={stringModel:'piano'};g.phraseLength=4;g.reset();
    const bars=play(g,16),copy=g.planner();for(let bar=0;bar<16;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual(bars);
    expect(bars[0].state.composition.instrumentGroove.profiles.lead).toBe('keys');
    const saved=JSON.parse(JSON.stringify(copy.plan.get(5)));for(let bar=6;bar<16;bar++)copy.plan.delete(bar);copy.plan.set(5,saved);
    for(let bar=6;bar<16;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual(bars);
    expect(g.planner({instrumentGroove:false}).instrumentGroove).toBe(false);
    g.roles.lead.instrument.preset={stringModel:'plucked'};g.planBar(2);expect(g.plan.get(2).state.composition.instrumentGroove.profiles.lead).toBe('keys');
    g.planBar(4);expect(g.plan.get(4).state.composition.instrumentGroove.profiles.lead).toBe('plucked');
});

test('joint counterpoint plans known phrases, retains protected endpoints, restores and leaves explicit parallel harmony alone',()=>{
    const settings={...defaultSettings(),seed:42,leadActivity:1,leadDensity:.75,counter:{mode:'line',activity:1},sections:{mode:'off',phrases:4},humanize:{timing:0,velocity:0,detune:0}};
    const g=new Generator(settings);g.phraseLength=8;g.reset();const bars=play(g,24),copy=g.planner();
    for(let bar=0;bar<24;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual(bars);
    expect(bars[0].state.composition.joint.beamWidth).toBe(20);expect(bars[0].state.composition.joint.bars.length).toBeGreaterThan(1);
    for(const b of bars)for(const r of b.state.composition.melody?.resolutions??[]){
        if(r.to.bar>=24)continue;expect(bars[r.to.bar].events.find(e=>e.role==='lead'&&e.beat===r.to.beat)?.midi).toBe(r.to.midi);
    }
    const saved=JSON.parse(JSON.stringify(copy.plan.get(5)));for(let bar=6;bar<24;bar++)copy.plan.delete(bar);copy.plan.set(5,saved);
    for(let bar=6;bar<24;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual(bars);
    expect(g.planner({jointCounterpoint:false}).jointCounterpoint).toBe(false);
    for(const mode of ['off','harmony']){
        const a=new Generator({...settings,counter:{mode,activity:1}}),b=new Generator({...settings,counter:{mode,activity:1}});b.jointCounterpoint=false;b.reset();
        expect(play(a,16).map(b=>b.events)).toEqual(play(b,16).map(b=>b.events));
    }
});

test('eight-bar phrases retain decisions, close rhythm at eight, and restore across the midpoint',()=>{
    const settings={...defaultSettings(),seed:42,leadActivity:1,leadDensity:.75,sections:{mode:'off',phrases:4}};
    const g=new Generator(settings);g.phraseLength=8;g.reset();const bars=play(g,32);
    expect(bars.map(b=>b.state.composition.phrase.start)).toEqual(Array.from({length:32},(_,i)=>Math.floor(i/8)*8));
    expect(bars[3].state.composition.rhythm.closing).toBe(false);expect(bars[7].state.composition.rhythm.closing).toBe(true);
    expect(bars[0].state.composition.performance.bars).toBe(8);expect(bars[0].state.composition.development.operations).toHaveLength(8);
    expect(bars[0].state.phrase.padStyle).toBe(bars[4].state.phrase.padStyle);
    const stopped=g.planner();for(let bar=0;bar<4;bar++)stopped.planBar(bar);
    stopped.settings.leadActivity=0;stopped.planBar(4);
    expect(stopped.plan.get(4).events.filter(e=>e.role==='lead')).toEqual([]);
    const copy=g.planner();for(let bar=0;bar<32;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual(bars);
    const saved=JSON.parse(JSON.stringify(copy.plan.get(3)));for(let bar=4;bar<32;bar++)copy.plan.delete(bar);copy.plan.set(3,saved);for(let bar=4;bar<32;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual(bars);
    g.endBar=32;for(let bar=32;bar<36;bar++)g.planBar(bar);expect(g.plan.get(32).ending).toBe(true);expect(g.plan.get(34).events).toEqual([]);
});

test('planned resolutions survive offline planning and restore, including borrowed harmony',()=>{
    const settings={...defaultSettings(),seed:42,leadActivity:1,leadDensity:.75,chordBorrow:.5,humanize:{timing:0,velocity:0,detune:0},sections:{mode:'off',phrases:4}};
    const g=new Generator(settings);g.phraseLength=8;g.reset();const bars=play(g,32),offline=g.planner();
    for(let bar=0;bar<32;bar++)offline.planBar(bar);expect([...offline.plan.values()]).toEqual(bars);
    const gestures=[...new Map(bars.flatMap(b=>b.state.composition.melody?.resolutions??[]).map(r=>[JSON.stringify(r),r])).values()];expect(gestures.length).toBeGreaterThan(0);
    for(const r of gestures){if(r.kind==='anticipation'){expect(bars[r.to.bar].chord.pitchClasses).toContain(r.from.midi%12);continue;}
        const target=bars[r.to.bar].events.find(e=>e.role==='lead'&&e.beat===r.to.beat);expect(target?.midi).toBe(r.to.midi);expect(bars[r.to.bar].chord.pitchClasses).toContain(r.to.midi%12);}
    const saved=JSON.parse(JSON.stringify(offline.plan.get(5)));for(let bar=6;bar<32;bar++)offline.plan.delete(bar);offline.plan.set(5,saved);for(let bar=6;bar<32;bar++)offline.planBar(bar);expect([...offline.plan.values()]).toEqual(bars);
});

test('contrast and return plans preserve theme memory across four/eight-bar restores',()=>{
    for(const length of [4,8]){
        const g=new Generator({...defaultSettings(),seed:42,leadRepeat:0,leadActivity:1,leadDensity:.75,sections:{mode:'off',phrases:4}});
        g.phraseLength=length;g.reset();const bars=play(g,length*4),contrast=bars[length*2],returned=bars[length*3];
        expect(contrast.state.composition.phrase.role).toBe('contrast');expect(returned.state.composition.phrase.role).toBe('return');
        expect(returned.state.composition.phrase.themeId).toBe(0);expect(returned.state.composition.themes).toEqual(bars[0].state.composition.themes);
        const copy=g.planner();for(let bar=0;bar<length*4;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual(bars);
        const at=length*2+1,saved=JSON.parse(JSON.stringify(copy.plan.get(at)));for(let bar=at+1;bar<length*4;bar++)copy.plan.delete(bar);copy.plan.set(at,saved);
        for(let bar=at+1;bar<length*4;bar++)copy.planBar(bar);expect([...copy.plan.values()]).toEqual(bars);
    }
});

test('pentatonic melody keeps its notes over major/minor parent harmony in every tonic',()=>{
    for(const mode of ['Pentatonic-1','Pentatonic-5'])for(let tonic=0;tonic<12;tonic++){
        const settings={...defaultSettings(),mode,tonic,seed:42,leadActivity:1,leadDensity:.75,sections:{mode:'off',phrases:4},humanize:{timing:0,velocity:0,detune:0},counter:{mode:'harmony',activity:1},drift:{...defaultSettings().drift,mode:'off'}};
        const g=new Generator(settings),bars=play(g,16),allowed=bars[0].chord.scalePcs;
        expect(allowed).toHaveLength(5);expect(bars[0].chord.harmonyPcs).toHaveLength(7);
        bars.flatMap(b=>b.events).filter(e=>e.role==='lead'||e.role==='counter').forEach(e=>expect(allowed).toContain(e.midi%12));
        const offline=g.planner();for(let bar=0;bar<16;bar++)offline.planBar(bar);expect([...offline.plan.values()]).toEqual(bars);
    }
});

test('parent chord labels use seven degrees, selected colours and Original stay available',()=>{
    const g=new Generator({...defaultSettings(),tonic:0,mode:'Pentatonic-1',padNotes:3,seed:42});
    const music=g.homeMusic(),parent=g.buildChord(music,'vi');expect(parent.root).toBe('A');expect(parent.name).toBe('Am');expect(parent.pitchClasses).toEqual([9,0,4]);
    g.set('harmonyScale','selected');const selected=g.buildChord(music,'vi');expect(selected.root).toBe('C');expect(selected.harmonyPcs).toBeUndefined();
    g.set('generation','legacy');g.set('harmonyScale','auto');expect(g.buildChord(music,'vi')).toEqual(selected);
    g.set('generation','latest');g.set('harmonyScale','minor');expect(g.buildChord({...music,mode:'Pentatonic-5'},'I').pitchClasses).toEqual([0,3,7]);
});

test('held wind expression copies independently and preserves written notes and Original',()=>{
    const settings={...defaultSettings(),seed:42,leadActivity:1,sections:{mode:'off',phrases:4}};
    const g=new Generator(settings);g.grooveVoices={lead:{name:'Reed Lead',preset:{vibratoDepth:0}},counter:{name:'Reed Lead'},pad:{name:'Piano'},bass:{name:'Chip'}};
    const held=g.planner({noteExpression:false}),plain=g.planner({noteExpression:false,heldExpression:false,noteConnection:false,gateEnvelopes:false});
    let count=0;
    for(let bar=0;bar<16;bar++) { held.planBar(bar);plain.planBar(bar);const events=held.plan.get(bar).events;
        count+=events.filter(e=>e.expression?.breathDepth).length;
        expect(events.map(({expression,...e})=>e)).toEqual(plain.plan.get(bar).events);
    }
    expect(count).toBeGreaterThan(0);expect(plain.planner().heldExpression).toBe(false);
    const original=new Generator({...settings,generation:'legacy'});original.grooveVoices=g.grooveVoices;
    for(let bar=0;bar<8;bar++) {original.planBar(bar);expect(original.plan.get(bar).events.every(e=>!e.expression)).toBe(true);}
});

test('connected wind phrases are note-local, copy their permission and never alter Original',()=>{
    const g=new Generator({...defaultSettings(),seed:42,leadActivity:1,sections:{mode:'off',phrases:4}});
    g.grooveVoices={lead:{name:'Reed Lead'},counter:{name:'Soft Flute'},pad:{name:'Piano'},bass:{name:'Chip'}};
    const enabled=g.planner({noteExpression:false,heldExpression:false}),disabled=g.planner({noteExpression:false,heldExpression:false,noteConnection:false,gateEnvelopes:false});
    let count=0;
    for(let bar=0;bar<16;bar++) {enabled.planBar(bar);disabled.planBar(bar);const events=enabled.plan.get(bar).events;
        count+=events.filter(e=>e.expression?.connected).length;
        expect(events.map(({expression,...e})=>e)).toEqual(disabled.plan.get(bar).events);
    }
    expect(count).toBeGreaterThan(0);expect(disabled.planner().noteConnection).toBe(false);
    const legacy=new Generator({...defaultSettings(),generation:'legacy'});legacy.grooveVoices=g.grooveVoices;
    legacy.planBar(0);expect(legacy.plan.get(0).events.every(e=>!e.expression)).toBe(true);
});

test('timing permissions are independent, use felt BPM in compound meter and bypass Original',()=>{
 const settings={...defaultSettings(),seed:42,meter:'6/8',bpm:90,leadActivity:1,sections:{mode:'off',phrases:4}};
 const g=new Generator(settings);g.grooveVoices={lead:{name:'Reed Lead'},counter:{name:'Flute'},pad:{name:'Piano'},bass:{name:'Chip'}};
 const on=g.planner({tempoEffects:true,gateEnvelopes:true}),off=g.planner({tempoEffects:false,gateEnvelopes:false});
 let count=0;const plain=events=>events.map(({expression,...e})=>e);
 for(let bar=0;bar<8;bar++) {on.planBar(bar);off.planBar(bar);const events=on.plan.get(bar).events;
  expect(plain(events)).toEqual(plain(off.plan.get(bar).events));
  for(const event of events.filter(e=>e.role!=='perc')) {expect(event.expression.tempoBeat).toBeCloseTo(60/(on.plan.get(bar).bpm*.75));count++;}
 }
 expect(count).toBeGreaterThan(0);expect(on.planner().tempoEffects).toBe(true);expect(off.planner().gateEnvelopes).toBe(false);
 on.endBar=8;on.planBar(8);expect(on.plan.get(8).events.filter(e=>e.role!=='perc').every(e=>Math.abs(e.expression?.tempoBeat-60/(on.plan.get(8).bpm*.75))<1e-9)).toBe(true);
 const original=new Generator({...settings,generation:'legacy'});original.tempoEffects=true;original.planBar(0);
 expect(original.plan.get(0).events.every(e=>!e.expression)).toBe(true);
});

test('untouched presets retain their envelope tails; fitting requires explicit opt-in',()=>{
 const g=new Generator({...defaultSettings(),seed:42,leadActivity:1,sections:{mode:'off',phrases:4}});
 g.grooveVoices={lead:{name:'Reed Lead'},counter:{name:'Flute'},pad:{name:'Soft Pad'},bass:{name:'Bass'}};
 const untouched=g.planner(),enabled=g.planner({gateEnvelopes:true});let fitted=0;
 for(let bar=0;bar<8;bar++) {untouched.planBar(bar);enabled.planBar(bar);
  expect(untouched.plan.get(bar).events.every(e=>!e.expression?.gateAware)).toBe(true);
  fitted+=enabled.plan.get(bar).events.filter(e=>e.expression?.gateAware).length;
 }
 expect(fitted).toBeGreaterThan(0);
});

test('slides copy independently, preserve the written score and bypass Original',()=>{
 const settings={...defaultSettings(),seed:42,leadActivity:1,leadDensity:1,padWeights:{sustain:1},sections:{mode:'off',phrases:4}};
 const g=new Generator(settings),on=g.planner({noteSlides:true,padPitchMotion:true,bassPitchMotion:true,chordSlides:true}),off=g.planner({noteSlides:false,chordSlides:false});let lead=0,pad=0;
 const plain=events=>events.map(({expression,...e})=>e);
 for(let bar=0;bar<16;bar++){on.planBar(bar);off.planBar(bar);const events=on.plan.get(bar).events;
  expect(plain(events)).toEqual(plain(off.plan.get(bar).events));
  lead+=events.filter(e=>e.role==='lead'&&e.expression?.pitchMotion).length;pad+=events.filter(e=>e.role==='pad'&&e.expression?.slideFromMidi!==undefined).length;
  const groups=new Map();for(const e of events.filter(e=>e.role==='pad'&&e.expression?.slideFromMidi!==undefined))groups.set(e.beat,(groups.get(e.beat)||0)+1);expect([...groups.values()].every(n=>n===1)).toBe(true);
 }
 expect(lead).toBeGreaterThan(0);expect(pad).toBeGreaterThan(0);expect(on.planner().noteSlides).toBe(true);expect(on.planner().padPitchMotion).toBe(true);expect(on.planner().bassPitchMotion).toBe(true);expect(off.planner().chordSlides).toBe(false);
 const legacy=new Generator({...settings,generation:'legacy'});legacy.noteSlides=true;legacy.chordSlides=true;legacy.planBar(0);expect(legacy.plan.get(0).events.every(e=>!e.expression)).toBe(true);
});

test('held-glide live booking joins the same notes as the shared renderer interpretation and restarts after seeking',async()=>{
 const {joinHeldNotes}=await import('./composition/heldGlides');
 const g=new Generator({...defaultSettings(),bpm:60,sections:{mode:'off',phrases:4}});g.heldBassGlides=true;g.AC.currentTime=0;
 g.roles.bass.instrument.preset={gainSustain:.8};g.ensurePlanned=()=>{};g.applyTone=()=>{};g.currentBar=0;g.plan=new Map();
 const notes=[];for(let bar=0;bar<6;bar++){
  const event={role:'bass',midi:36+[0,5,2,0,5,2][bar],beat:0,length:3.95,velocity:.7,detune:0};
  g.plan.set(bar,{bar,bpm:60,events:[event],state:{phrase:{section:{start:0}}}});
  notes.push({...event,time:bar*4,duration:3.95,bar,section:0});
 }
 const booked=[];g.roles.bass.instrument.scheduleNote=(midi,time,duration,velocity,detune,expression)=>booked.push({midi,time,duration,expression});
 const expected=joinHeldNotes(notes,{bass:true,voices:g.grooveVoiceSnapshot()});
 for(let bar=0;bar<6;bar++)g.onBeat({bar,beatInBar:0,time:10+bar*4,secondsPerBeat:1});
 const rounded=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='number'?Math.round(v*1e8)/1e8:v));
 expect(rounded(booked.map(n=>({midi:n.midi,time:n.time-10,duration:n.duration,expression:n.expression})))).toEqual(rounded(expected.map(n=>({midi:n.midi,time:n.time,duration:n.duration,expression:n.expression}))));
 expect(booked).toHaveLength(2);expect(g.planner().heldBassGlides).toBe(true);expect(g.planner().heldPadGlides).toBeUndefined();
 // Seeking into the middle of a former chain gives the destination a fresh head.
 for(const p of g.plan.values())if(p.bar>=2)for(const e of p.events)e.booked=false;
 g.currentBar=2;g.onBeat({bar:2,beatInBar:0,time:40,secondsPerBeat:1});expect(booked.at(-1).midi).toBe(38);expect(booked.at(-1).time).toBe(40);
 const stopped=vi.fn();g.roles.bass.instrument.silence=stopped;g.heldResetBar=3;g.currentBar=3;
 g.onBeat({bar:3,beatInBar:0,time:44,secondsPerBeat:1});expect(stopped).toHaveBeenCalledWith(44);
 g.settings.generation='legacy';expect(g.heldGlideBookings(3).size).toBe(0);
});

test('early notes after a held reset wait until the old voice is cancelled at the boundary',()=>{
 const g=new Generator({...defaultSettings(),bpm:60,sections:{mode:'off',phrases:4}});g.AC.currentTime=0;g.currentBar=0;g.ensurePlanned=()=>{};g.applyTone=()=>{};
 const early={role:'bass',midi:41,beat:-.03,length:3.9,velocity:.7};
 g.plan=new Map([[0,{bar:0,bpm:60,events:[],state:{phrase:{}}}],[1,{bar:1,bpm:60,events:[early],state:{phrase:{}}}]]);
 g.heldActiveRoles=new Set(['bass']);g.heldResetBar=1;const sequence=[];
 g.roles.bass.instrument.silence=time=>sequence.push(['cancel',time]);g.roles.bass.instrument.scheduleNote=(midi,time)=>sequence.push(['attack',time]);
 g.onBeat({bar:0,beatInBar:3,time:13,secondsPerBeat:1});expect(early.booked).toBeUndefined();
 g.onBeat({bar:1,beatInBar:0,time:14,secondsPerBeat:1});expect(sequence).toEqual([['cancel',14],['attack',14]]);
 g.loop={from:0,to:1,dirty:false};g.heldResetBar=2;g.transport.rebase=()=>{};g.loopBack();expect(g.heldResetBar).toBe(0);
});

test('named wind colour is applied in Latest, restored on generation changes, and respects custom patches',()=>{
 const g=new Generator(defaultSettings()),apply=vi.fn();g.roles.lead.instrument.applyPreset=apply;
 g.loadRolePreset('lead','Pan Flute');expect(apply.mock.calls.at(-1)[0].breathAmount).toBeGreaterThan(0);expect(apply.mock.calls.at(-1)[0].noiseMix).toBe(0);
 g.settings.generation='legacy';g.refreshStringPatches();expect(apply.mock.calls.at(-1)[0].breathAmount).toBeUndefined();
 g.settings.generation='latest';g.refreshStringPatches();expect(apply.mock.calls.at(-1)[0].breathAmount).toBeGreaterThan(0);
 const custom={vcoType:'sine',gainSustain:.7};g.loadRolePreset('lead','Pan Flute',custom);expect(apply.mock.calls.at(-1)[0]).toBe(custom);
});


test('unresolved progression roots survive section arrivals, drift and requested endings without a tonic',()=>{
 for(const progression of [25,26,27,28,29,30])for(const mode of ['Major-1','Major-6','Pentatonic-1']){
  const settings={...defaultSettings(),seed:42,progression,mode,sections:{mode:'strong',phrases:2},sectionTone:true};
  settings.drift={...settings.drift,mode:'wandering',progressionChance:1,keyChance:0,modeChance:0};
  const g=new Generator(settings);g.rulebookTrace=true;g.reset();g.endBar=60;
  for(let bar=0;bar<64;bar++){g.planBar(bar);const b=g.plan.get(bar);expect(b.chord.pitchClasses[0]).not.toBe(b.music.tonic);expect(b.chord.cadence).toBeUndefined();expect(b.music.progression).toBeGreaterThanOrEqual(25);}
 }
});
test('Altman uses chromatic pitch sets and restores its exact continuation and forecasts',async()=>{
 const {sceneBySlug,sceneSettings}=await import('./scenes'),{applyBook,inheritBook}=await import('./rulebook/session');
 const scene=sceneBySlug('altman'),settings=sceneSettings(scene,42);settings.playAmbience=false;settings.ambience=Object.fromEntries(Object.keys(settings.ambience).map(k=>[k,0]));const g=new Generator(settings);applyBook(g,inheritBook(scene.rulebook));g.reset();const copy=g.planner();
 const pcs=new Set();for(let bar=0;bar<96;bar++){g.planBar(bar);copy.planBar(bar);const b=g.plan.get(bar);expect(copy.plan.get(bar)).toEqual(b);expect(b.chord.tonality.mode).toBe('atonal');b.chord.pitchClasses.forEach(p=>pcs.add(p));expect(b.chord.cadence).toBeUndefined();expect(b.events.every(e=>[e.midi,e.beat,e.length,e.velocity].every(Number.isFinite)&&e.length>0)).toBe(true);}
 expect(pcs.size).toBe(12);expect(g.heldBassGlides).toBe(true);expect(g.noteSlides).toBe(true);
 const forecast=g.melodyHarmony(96,g.plan.get(95).nextMusic,g.plan.get(95).upcoming,8,g.plan.get(95).bpm);
 for(let bar=96;bar<104;bar++)g.planBar(bar);for(const h of forecast)expect(h.chord).toEqual(g.plan.get(h.bar).chord);
});
test('bitonality preserves the backing and transposes actual melodic events across phrase boundaries',()=>{
 const settings={...defaultSettings(),seed:42,leadActivity:1,counter:{mode:'line',activity:1},sections:{mode:'gentle',phrases:2}},a=new Generator(settings),b=new Generator({...settings,tonality:{mode:'bitonal',separation:1}});a.registerLevel=false;b.registerLevel=false;a.reset();b.reset();
 for(let bar=0;bar<48;bar++){a.planBar(bar);b.planBar(bar);const x=a.plan.get(bar),y=b.plan.get(bar);expect(y.chord.tonality.mode).toBe('bitonal');expect(y.events.map(({midi,expression,...event})=>({...event,midi:midi-(['lead','counter'].includes(event.role)?1:0),...(expression?{expression:{...expression,...(expression.connectionFrom!==undefined?{connectionFrom:expression.connectionFrom-(['lead','counter'].includes(event.role)?1:0)}:{})}}:{})}))).toEqual(x.events);}
});


test('tonal Altman returns through C-sharp, E, A and D with a thinner bed and higher viola',async()=>{
 const {sceneBySlug,sceneSettings}=await import('./scenes'),{applyBook,inheritBook}=await import('./rulebook/session'),{encodeSettings,decodeSettings}=await import('./settings');
 const scene=sceneBySlug('altman-tonal'),original=sceneBySlug('altman'),settings=sceneSettings(scene,42);
 expect(original.settings.tonality.mode).toBe('atonal');expect(settings.tonality.mode).toBe('tonal');expect(settings.voices.lead.octave).toBe(original.settings.voices.lead.octave+1);
 expect(settings.padNotes).toBeLessThan(original.settings.padNotes);expect(settings.volumes.pad).toBeLessThan(original.settings.volumes.pad);
 expect(decodeSettings(encodeSettings(settings))).toEqual(settings);
 settings.playAmbience=false;settings.ambience=Object.fromEntries(Object.keys(settings.ambience).map(k=>[k,0]));
 const g=new Generator(settings);g.rulebookTrace=true;applyBook(g,inheritBook(scene.rulebook));g.reset();
 for(let bar=0;bar<8;bar++){g.planBar(bar);const b=g.plan.get(bar);expect(b.chord.pitchClasses[0]).toBe([1,4,9,2][b.ruleTrace.slot.index]);expect(b.chord.scalePcs).toEqual([2,4,5,7,9,10,1]);expect(b.chord.unresolved).toBeUndefined();}
 expect(g.noteSlides).toBe(false);expect(g.heldPadGlides).toBe(true);expect(g.noteResolution).toBe(true);
 settings.drift={...settings.drift,mode:'wandering',progressionChance:1,keyChance:0,modeChance:0};g.reset();const p=g.planner();
 for(let bar=0;bar<64;bar++){p.planBar(bar);const b=p.plan.get(bar);expect(b.music.progression).toBe(31);expect(b.events.every(e=>[e.midi,e.beat,e.length,e.velocity].every(Number.isFinite)&&e.length>0)).toBe(true);}
});

test('audio sleep is blocked by transport, ambience, live keys, auditions and the stop fade',()=>{
 const g=Object.create(Generator.prototype);g.transport={isRunning:false};g.ambience={running:false};g.liveNotes=new Set();expect(g.canSleepAudio()).toBe(true);g.transport.isRunning=true;expect(g.canSleepAudio()).toBe(false);g.transport.isRunning=false;g.ambience.running=true;expect(g.canSleepAudio()).toBe(false);g.ambience.running=false;g.liveNotes.add('lead:1');expect(g.canSleepAudio()).toBe(false);g.liveNotes.clear();g.stopFade=1;expect(g.canSleepAudio()).toBe(false);g.stopFade=null;g.auditionPending=1;expect(g.canSleepAudio()).toBe(false);
});


test('percussion voice changes preserve melody, rhythm, transport and track controls',async()=>{
 const g=new Generator({...defaultSettings(),seed:42});g.setRoleVolume('perc',.27);g.roles.perc.mute=true;
 const before=g.plan,replan=vi.spyOn(g,'replan');const drums={...g.settings.drums};
 for(const voice of ['crisp','tr808','hand','felt']){
  await g.loadPercussionVoice(voice);expect(g.plan).toBe(before);expect(replan).not.toHaveBeenCalled();
  expect(g.settings.drums).toEqual({...drums,kit:voice});expect(g.roles.perc.volume).toBe(.27);expect(g.roles.perc.mute).toBe(true);expect(g.roles.perc.instrument.voicePreset).toBe(voice);
 }
 expect(g.percussionEngine).toBe('wasm');
});
test('failed percussion preparation restores the prior voice and custom sound edits',async()=>{
 const g=new Generator({...defaultSettings(),seed:42});g.settings.drumKit.bell.tone=-.3;
 const before=structuredClone(g.settings);percussionMock.fail=true;
 try {await expect(g.loadPercussionVoice('tr808')).rejects.toThrow('Kernel unavailable');expect(g.settings).toEqual(before);expect(g.percussionEngine).toBe('native');expect(g.roles.perc.instrument.voicePreset).toBe('felt');}
 finally{percussionMock.fail=false;}
});


test('new percussion styles leave the melodic plan intact and hand voice prepares independently',async()=>{
 const defaults=defaultSettings(),g=new Generator({...defaults,seed:73});
 const shapes=[];
 for(const style of ['bossa','jazz','broken','ambient','hand']){
  g.set('drums',{...g.settings.drums,style});g.reset();g.ensurePlanned(15);
  shapes.push([...g.plan.values()].filter(p=>p.bar<16).map(p=>p.events.filter(e=>e.role!=='perc').map(({role,midi,beat,length})=>({role,midi,beat,length}))));
 }
 for(const shape of shapes)expect(shape).toEqual(shapes[0]);
 const hand=new Generator({...defaultSettings(),drums:{...defaults.drums,kit:'hand'}});await hand.roles.perc.instrument.ready;
 expect(hand.percussionEngine).toBe('wasm');expect(hand.roles.perc.instrument.voicePreset).toBe('hand');expect(hand.audioEngine).not.toBe('wasm');
});

describe('smooth home changes', () => {
    const changed = (smooth) => {
        const gen = generator(5, { mode: 'off' });
        gen.smoothChanges = smooth;
        play(gen, 8);
        gen.resumeBar = 8; // paused at bar 8
        gen.currentBar = 7;
        gen.setMany({ tonic: 7, bpm: gen.settings.bpm + 30 });
        return { gen, bars: [8, 9, 10, 11, 12, 13, 14, 15].map((b) => { gen.currentBar = b; gen.ensurePlanned(b); return gen.plan.get(b); }) };
    };
    it('pivot through the new key’s dominant and glide to the new tempo', () => {
        const { gen, bars } = changed(true);
        expect(bars[0].chord.numeral).toContain('/');
        expect(bars[1].music.tonic).toBe(7);
        expect(bars[0].bpm).toBeLessThan(gen.settings.bpm);
        for (let i = 1; i < bars.length; i++) expect(bars[i].bpm).toBeGreaterThanOrEqual(bars[i - 1].bpm);
        expect(bars[bars.length - 1].bpm).toBe(gen.settings.bpm);
    });
    it('change at once without smooth changes', () => {
        const { gen, bars } = changed(false);
        expect(bars[0].music.tonic).toBe(7);
        expect(bars[0].bpm).toBe(gen.settings.bpm);
    });
});

describe('key lifts', () => {
    it('pivot a whole step up after a build and come home at the next breakdown', () => {
        let found = null;
        for (let seed = 1; seed < 40 && !found; seed++) {
            const gen = generator(seed, { mode: 'off' });
            gen.settings.sections = { ...gen.settings.sections, mode: 'gentle' };
            gen.settings.keyLift = 1;
            gen.reset();
            const bars = play(gen, 160);
            const lifted = bars.findIndex((b) => b.keyLift === 2);
            if (lifted < 0) continue;
            found = { bars, lifted };
        }
        expect(found).not.toBeNull();
        const { bars, lifted } = found;
        const home = bars[0].music.tonic;
        expect(bars[lifted].chord.numeral).toContain('/');
        expect(bars[lifted + 1].music.tonic).toBe((home + 2) % 12);
        const back = bars.findIndex((b, i) => i > lifted && b.keyLift === 0);
        if (back > 0) expect(bars[back].music.tonic).toBe(home);
    });
    it('never lift when off', () => {
        const gen = generator(3, { mode: 'off' });
        gen.settings.sections = { ...gen.settings.sections, mode: 'gentle' };
        gen.reset();
        expect(play(gen, 120).every((b) => !b.keyLift)).toBe(true);
    });
});

describe('chords change about as often in any metre', () => {
    it('long bars halve bars per chord or split, short ones double it', () => {
        expect(chordBars(METERS['7/4'], 2)).toBe(1);
        expect(chordBars(METERS['6/4'], 4)).toBe(2);
        expect(chordBars(METERS['7/4'], 1)).toBe(1);
        expect(chordBars(METERS['2/4'], 1)).toBe(2);
        for (const id of ['4/4', '3/4', '5/4', '6/8', '12/8', '7/8']) expect(chordBars(METERS[id], 2)).toBe(2);
        expect(splitBeat(METERS['7/4'])).toBe(4);
        expect(splitBeat(METERS['6/4'])).toBe(3);
        expect(splitBeat(METERS['4/4'])).toBe(null);
    });

    it('a 7/4 bar at one chord per bar moves to a bridge chord at beat 4', () => {
        const gen = new Generator({ ...defaultSettings(), seed: 3, meter: '7/4', barsPerChord: 1, drums: { ...defaultSettings().drums, style: 'brushes' } });
        const bars = play(gen, 24), split = bars.filter((b) => b.split);
        expect(split.length).toBeGreaterThan(12);
        for (const b of split) {
            expect(b.split.beat).toBe(4);
            expect(b.split.chord.pitchClasses).not.toEqual(b.chord.pitchClasses);
            const after = b.events.filter((e) => e.role === 'pad' && e.beat >= 4);
            for (const e of after) expect(b.split.chord.pitchClasses).toContain(e.midi % 12);
            const kicks = b.events.filter((e) => e.role === 'perc' && e.midi === 0);
            if (kicks.some((e) => e.beat < 0.25)) expect(kicks.some((e) => Math.abs(e.beat - 4) < 0.3)).toBe(true);
        }
    });

    it('a metre change while playing starts the progression again when chord lengths change', () => {
        const gen = new Generator({ ...defaultSettings(), seed: 5, meter: '4/4', barsPerChord: 2 });
        play(gen, 11);
        gen.transport.timer = 1;
        gen.set('meter', '7/4');
        gen.transport.timer = null;
        const bars = [];
        for (let bar = 11; bar < 40; bar++) { gen.currentBar = bar; gen.ensurePlanned(bar); bars.push(gen.plan.get(bar)); }
        const first = bars.find((b) => b.meter.units === 7);
        expect(first.music.cycleStart).toBe(first.bar);
        for (const b of bars.filter((b) => b.meter.units === 7)) { expect(b.chordStart).toBe(true); expect(b.chord.name).toBeTruthy(); }
    });
});

describe('every meter plays', () => {
    it.each(Object.keys(METERS))('%s: bars fill their length with finite notes in every part', (id) => {
        const meter = METERS[id];
        expect(groupStarts(meter).every((s) => s < meter.units)).toBe(true);
        expect(beatStarts(meter).every((s) => s < meter.units)).toBe(true);
        const gen = generator(9, { mode: 'off' });
        gen.settings.meter = id;
        gen.settings.drums = { ...gen.settings.drums, style: 'downtempo' };
        gen.settings.sections = { mode: 'gentle', phrases: 2 };
        gen.reset();
        const roles = new Set();
        for (const b of play(gen, 48)) for (const e of b.events) {
            expect([e.midi, e.beat, e.length, e.velocity].every(Number.isFinite)).toBe(true);
            expect(e.beat).toBeLessThan(meter.units);
            roles.add(e.role);
        }
        expect(['perc', 'pad', 'bass'].every((r) => roles.has(r))).toBe(true);
    });
});

describe('breakdowns', () => {
    const piece = (breakdowns) => {
        const gen = generator(11, { mode: 'off' });
        Object.assign(gen.settings, { meter: '4/4', sections: { mode: 'strong', phrases: 2 }, drums: { ...gen.settings.drums, style: 'downtempo' }, breakdowns });
        gen.reset();
        return play(gen, 96);
    };
    it('can play in a meter of their own and come back to the piece’s', () => {
        const bars = piece({ meter: '6/8', halfTime: false }), breakdown = bars.filter((b) => b.state.phrase.section?.type === 'breakdown');
        expect(breakdown.length).toBeGreaterThan(0);
        for (const b of bars) {
            const own = b.state.phrase.section?.type === 'breakdown';
            expect(b.meter.units).toBe(own ? 6 : 4);
            for (const e of b.events) expect(e.beat).toBeLessThan(b.meter.units);
        }
    });
    it('can stretch the drums to half time, and only in breakdowns', () => {
        const plain = piece({ meter: 'same', halfTime: false }), half = piece({ meter: 'same', halfTime: true });
        let changed = 0;
        plain.forEach((b, i) => {
            const hits = (bar) => bar.events.filter((e) => e.role === 'perc').map((e) => [e.midi, +(e.beat).toFixed(3)]).sort();
            if (b.state.phrase.section?.type !== 'breakdown') { expect(hits(half[i])).toEqual(hits(b)); return; }
            for (const [, beat] of hits(half[i])) expect(hits(b).some(([, x]) => Math.abs(x * 2 - beat) < 0.06)).toBe(true);
            if (JSON.stringify(hits(half[i])) !== JSON.stringify(hits(b))) changed++;
        });
        expect(changed).toBeGreaterThan(0);
    });
});

describe('the feel pad', () => {
    const plan = (feel) => {
        const gen = generator(21, { mode: 'off' });
        Object.assign(gen.settings, { sections: { mode: 'gentle', phrases: 2 }, drums: { ...gen.settings.drums, style: 'downtempo', activity: 0.4 }, feel });
        gen.reset();
        const bars = play(gen, 48);
        return { gen, notes: (role) => bars.flatMap((b) => b.events.filter((e) => e.role === role)).length, tone: Math.max(...bars.map((b) => b.tone)) };
    };
    it('busier plays more, calmer less, and the centre leaves the preset as it is', () => {
        const centre = plan({ busy: 0, bright: 0 }), busy = plan({ busy: 1, bright: 0 }), calm = plan({ busy: -1, bright: 0 });
        expect(busy.notes('pad') + busy.notes('perc')).toBeGreaterThan(centre.notes('pad') + centre.notes('perc'));
        expect(calm.notes('perc')).toBeLessThan(centre.notes('perc'));
        expect(centre.gen.settings.feel).toEqual({ busy: 0, bright: 0 });
        expect(busy.gen.settings.drums.activity).toBe(0.4); // the settings keep the preset's values
    });
    it('darker closes the tone', () => {
        expect(plan({ busy: 0, bright: -1 }).tone).toBeLessThan(plan({ busy: 0, bright: 0 }).tone);
    });
});

describe('the section readout', () => {
    it('names the section, the bars left in it and the next one', () => {
        const gen = generator(5, { mode: 'off' });
        gen.settings.sections = { mode: 'strong', phrases: 2 };
        gen.reset();
        play(gen, 3);
        const r = gen.sectionReadout(1);
        expect(r.type).toBe('intro');
        expect(r.left).toBe(r.end - 1 + 1);
        expect(['build', 'full']).toContain(r.next);
        gen.settings.sections = { mode: 'off', phrases: 2 };
        gen.reset();
        play(gen, 2);
        expect(gen.sectionReadout(1)).toBeNull();
    });
});

describe('next section now', () => {
    it('ends the playing section at the next phrase boundary and carries on without skipping a bar', () => {
        const gen = generator(5, { mode: 'off' });
        gen.settings.sections = { mode: 'strong', phrases: 4 };
        gen.reset();
        const bars = play(gen, 6);
        const section = gen.sectionOf(5);
        expect(section.end).toBeGreaterThan(8);
        gen.bookingBar = 5;
        gen.resumeBar = 6; // paused here
        expect(gen.nextSectionNow()).toBe(true);
        const after = [6, 7, 8, 9].map((b) => { gen.currentBar = b; gen.ensurePlanned(b); return gen.plan.get(b); });
        expect(after[1].state.phrase.section.start).toBe(section.start);
        expect(after[2].state.phrase.section.start).toBe(8);
        expect(after[2].state.phrase.section.type).not.toBe(section.type);
        expect(gen.sectionReadout(7).left).toBe(1);
        expect(bars.length + after.length).toBe(10);
    });
});

describe('a busier feel on drums', () => {
    it('adds soft ghost notes even where the style keeps its density', () => {
        const count = (busy) => {
            const gen = generator(21, { mode: 'off' });
            Object.assign(gen.settings, { drums: { ...gen.settings.drums, style: 'downtempo', activity: 0.4 }, feel: { busy, bright: 0 } });
            gen.reset();
            return play(gen, 32).flatMap((b) => b.events.filter((e) => e.role === 'perc'));
        };
        const centre = count(0), busy = count(1);
        expect(busy.length).toBeGreaterThan(centre.length * 1.2);
        expect(busy.filter((e) => e.ghost).every((e) => e.velocity < 0.6)).toBe(true);
    });
});

describe('generated progressions', () => {
    const plan = (extra, bars = 48) => {
        const g = new Generator({ ...defaultSettings(), seed: 11, tonic: 0, mode: 'Major-1', progression: 0, barsPerChord: 1, sections: { mode: 'off', phrases: 2 }, ...extra });
        const p = g.planner();
        for (let bar = 0; bar < bars; bar++) p.planBar(bar);
        return [...p.plan.values()].sort((a, z) => a.bar - z.bar);
    };
    const names = (bars) => bars.map((b) => b.chord.name);

    test('bank mode is untouched by the new settings', () => {
        expect(names(plan({ progressionMode: 'bank' }))).toEqual(names(plan({})));
        expect(plan({}).every((b) => b.music.numerals === undefined)).toBe(true);
    });

    test('a generated plan has chords of the bank progression length, deterministic for a seed', () => {
        const a = plan({ progressionMode: 'generated' });
        expect(names(plan({ progressionMode: 'generated' }))).toEqual(names(a));
        const cycle = PROGRESSIONS[0].length;
        expect(a[0].music.numerals).toHaveLength(cycle);
        a.forEach((b) => { expect(b.chord.pitchClasses.length).toBeGreaterThanOrEqual(3); expect(b.chord.name).toBeTruthy(); });
    });

    test('with no wander the first generated cycle repeats for ever; with full wander the cycles change', () => {
        const cycle = PROGRESSIONS[0].length;
        const fixed = names(plan({ progressionMode: 'generated', progressionWander: 0 }));
        for (let i = 0; i < fixed.length - cycle; i++) expect(fixed[i + cycle]).toBe(fixed[i]);
        const moving = names(plan({ progressionMode: 'generated', progressionWander: 1 }, 96));
        const cycles = new Set(); for (let i = 0; i + cycle <= moving.length; i += cycle) cycles.add(moving.slice(i, i + cycle).join('|'));
        expect(cycles.size).toBeGreaterThan(3);
    });

    test('a floating mood never plays the tonic chord and marks the harmony unresolved', () => {
        const bars = plan({ progressionMode: 'generated', progressionWander: 1, progressionMood: { brightness: 0, stability: 0.05, adventure: 0.5 } }, 64);
        expect(bars.every((b) => b.music.unsettled === true)).toBe(true);
        expect(bars.every((b) => b.chord.numeral !== 'I')).toBe(true);
        expect(bars.every((b) => b.chord.unresolved === true)).toBe(true);
    });

    test('a settled mood keeps the tonic in every cycle; dark moods borrow flat chords more than bright ones', () => {
        const settled = plan({ progressionMode: 'generated', progressionWander: 1, progressionMood: { brightness: 0, stability: 0.9, adventure: 0.3 } }, 64);
        const cycle = PROGRESSIONS[0].length;
        for (let i = 0; i + cycle <= settled.length; i += cycle) expect(settled.slice(i, i + cycle).some((b) => b.chord.numeral === 'I')).toBe(true);
        const flats = (brightness) => [11, 12, 13, 14, 15, 16].flatMap((seed) => plan({ seed, progressionMode: 'generated', progressionWander: 1, progressionMood: { brightness, stability: 0.7, adventure: 0.5 } }, 64)).filter((b) => /^b?(VI|VII)|^iv/.test(b.chord.numeral)).length;
        expect(flats(-0.9)).toBeGreaterThan(flats(0.9));
    });

    test('a minor key and a non-seven-note scale both plan without error', () => {
        expect(plan({ progressionMode: 'generated', mode: 'Major-6' }, 32).length).toBe(32);
        const penta = plan({ progressionMode: 'generated', mode: 'Pentatonic-1' }, 32);
        expect(penta.length).toBe(32);
    });
});
