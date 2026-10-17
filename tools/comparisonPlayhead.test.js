import { playbackPosition, comparisonPlayheads } from './comparisonPlayhead';
const plan={seconds:12,bars:[{bar:0,start:0,seconds:2,units:4},{bar:1,start:2,seconds:4,units:6,unitsPerBeat:3},{bar:4,start:6,seconds:6,units:4}]};
test('media position uses actual bar durations and felt beats, including bar five, preroll and tails',()=>{
    expect(playbackPosition(plan,6)).toMatchObject({bar:5,label:'Bar 5 · beat 1',fraction:.5});
    expect(playbackPosition(plan,4).label).toBe('Bar 2 · beat 2');
    expect(playbackPosition(plan,-.05).bar).toBeNull();expect(playbackPosition(plan,12).bar).toBeNull();
});
test('paused seeking synchronises both chart markers and disposal stops updates',()=>{
    const group=comparisonPlayheads(),audios=[document.createElement('audio'),document.createElement('audio')];
    document.body.innerHTML='<canvas id="one"></canvas><canvas id="two"></canvas>';
    const canvases=[document.querySelector('#one'),document.querySelector('#two')];canvases.forEach(c=>c.width=1100);
    audios.forEach((a,i)=>group.add(a,canvases[i],plan,{offset:.05}));
    audios[0].currentTime=6.05;audios[0].dispatchEvent(new Event('seeked'));
    expect([...document.querySelectorAll('.comparison-position')].map(e=>e.dataset.bar)).toEqual(['5','5']);
    const positions=[...document.querySelectorAll('.comparison-cursor')].map(e=>parseFloat(e.style.left));
    expect(positions[0]).toBeCloseTo(52.9545,3);expect(positions[1]).toBe(positions[0]);
    group.dispose();audios[0].currentTime=0;audios[0].dispatchEvent(new Event('seeked'));
    expect(document.querySelector('.comparison-position').dataset.bar).toBe('5');
});
