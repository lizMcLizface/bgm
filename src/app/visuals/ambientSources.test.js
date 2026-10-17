import { ambientEmitters, createAmbientSources } from './ambientSources';
const paint = (h,s,l) => [h,s,l];
const settings = { ambience: { rain: 0.7, wind: 0.6, fire: 0.4 }, ambienceShape: {} };

test('silence and disabled ambience layers cannot produce a background', () => {
    expect(ambientEmitters(settings, {}, 3, { colour: paint })).toEqual([]);
    expect(ambientEmitters(settings, { wind: 0, rain: 0 }, 3, { colour: paint })).toEqual([]);
    expect(ambientEmitters({ ...settings, ambience: { wind: 0 } }, { wind: 1 }, 3, { colour: paint })).toEqual([]);
});

test('ambient placement is repeatable and independent of the music seed', () => {
    const a=ambientEmitters({ ...settings, seed: 1 }, { rain: 0.4, fire: 0.5 }, 4, { colour: paint });
    const b=ambientEmitters({ ...settings, seed: 999 }, { rain: 0.4, fire: 0.5 }, 4, { colour: paint });
    expect(a).toEqual(b);
    expect(a.find(e=>e.role==='ambient-fire').vy).toBeGreaterThan(0);
    expect(a.find(e=>e.role==='ambient-rain').vy).toBeLessThan(0);
});

test('wind controls and measured sound envelopes affect the sources immediately', () => {
    const sample=(speed,pan,level)=>ambientEmitters({ ...settings, ambienceShape: { wind: { speed, pan, gusts: 0.2 } } }, { wind: level }, 4, { colour: paint });
    const slow=sample(0.1,-1,0.2),fast=sample(1,1,0.8);
    expect(slow[0].vx).toBeLessThan(0); expect(fast[0].vx).toBeGreaterThan(0);
    expect(Math.abs(fast[0].vx)).toBeGreaterThan(Math.abs(slow[0].vx));
    expect(fast[0].x).toBeGreaterThan(slow[0].x);
    expect(fast[0].strength).toBeGreaterThan(slow[0].strength);
});

test('real layer taps remain silent until audio arrives and disconnect on stop', () => {
    let amplitude=0;
    const node={connect:vi.fn(),disconnect:vi.fn()};
    const generator={ settings: { ...settings, ambienceVolume: 0.8 }, ambienceRunning: true,
        ambience: { chains: { wind: {drift:node} }, output:{gain:{value:1}}, pieceTime:t=>t },
        ambienceOut:{gain:{value:1}}, AC:{createAnalyser:()=>({getFloatTimeDomainData:data=>data.fill(amplitude)})} };
    const meter=createAmbientSources(generator);
    expect(meter.sample(2,{colour:paint})).toEqual([]);
    amplitude=0.03; expect(meter.sample(3,{colour:paint}).length).toBeGreaterThan(0);
    generator.settings.ambienceVolume=0; expect(meter.sample(4,{colour:paint})).toEqual([]);
    generator.ambienceRunning=false; expect(meter.sample(5,{colour:paint})).toEqual([]);
    expect(node.disconnect).toHaveBeenCalledOnce();
    meter.dispose();
});
