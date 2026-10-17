import { musicMood, noteColour } from './musicColour';
const major = { chord: { pitchClasses: [0,4,7], scalePcs: [0,2,4,5,7,9,11] }, state: { phrase: { section: { type: 'full' } } } };
const minor = { chord: { pitchClasses: [0,3,7], scalePcs: [0,2,3,5,7,8,10] }, state: { phrase: { section: { type: 'breakdown' } } } };

test('harmony, section and activity alter warmth, colour and light', () => {
    const warm=musicMood({tonic:0},major,0.8),cool=musicMood({tonic:0},minor,0.2);
    expect(warm.warmth).toBeGreaterThan(cool.warmth);
    expect(Math.abs(warm.hue-cool.hue)).toBeGreaterThan(90);
    expect(warm.light).toBeGreaterThan(cool.light);
    const tense=musicMood({tonic:0},{...major,chord:{...major.chord,pitchClasses:[0,4,7,10]}},0.8);
    expect(tense.tension).toBeGreaterThan(warm.tension);
    expect(tense.saturation).toBeGreaterThan(warm.saturation);
});

test('planned tension reaches the fluid mood without inventing a four-bar phase',()=>{
    const planned=tension=>({...major,state:{phrase:{section:{type:'build',motion:{tension}}}}});
    const relaxed=musicMood({tonic:0},planned(.1),.5),gathered=musicMood({tonic:0},planned(.85),.5);
    expect(gathered.tension).toBeGreaterThan(relaxed.tension);expect(gathered.saturation).toBeGreaterThan(relaxed.saturation);
});

test('fixed palettes remain recognisable while allowing musical shifts', () => {
    for(const planned of [major,minor]){
        const mood=musicMood({tonic:0},planned,0.5,{hue:18,sat:0.62,spread:0.7});
        for(let midi=36;midi<96;midi++){
            const paint=noteColour({midi,role:'lead',velocity:0.8},{hue:mood.hue,mood,spread:40});
            expect(Math.abs(paint.h-18)).toBeLessThan(45);
        }
    }
});

test('note register, velocity and timbre affect brightness; monochrome stays desaturated', () => {
    const mood=musicMood({tonic:0},major,0.5);
    const low=noteColour({midi:36,velocity:0.2,bright:0},{hue:mood.hue,mood,age:1});
    const high=noteColour({midi:84,velocity:0.9,bright:1},{hue:mood.hue,mood,age:1});
    expect(high.l).toBeGreaterThan(low.l);
    const mono=musicMood({tonic:0},major,1,{hue:220,sat:0.08});
    expect(noteColour({midi:84,velocity:1},{hue:mono.hue,mood:mono}).s).toBe(0.08);
});
