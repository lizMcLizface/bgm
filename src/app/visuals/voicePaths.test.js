import { voicePath, createVoiceMotion } from './voicePaths';

test('voice paths are repeatable, independent, bounded, and cover both axes', () => {
    expect(voicePath('pad', 17, 42)).toEqual(voicePath('pad', 17, 42));
    expect(voicePath('pad', 17, 42)).not.toEqual(voicePath('bass', 17, 42));
    expect(voicePath('pad', 17, 42)).not.toEqual(voicePath('pad', 17, 43));
    const points = Array.from({ length: 360 }, (_, i) => voicePath('lead', i, 42));
    for (const p of points) { expect(p.x).toBeGreaterThanOrEqual(0.08); expect(p.x).toBeLessThanOrEqual(0.92); expect(p.y).toBeGreaterThanOrEqual(0.08); expect(p.y).toBeLessThanOrEqual(0.92); }
    expect(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))).toBeGreaterThan(0.5);
    expect(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))).toBeGreaterThan(0.5);
});

test('changing trajectory speed and returning from a hidden tab cannot teleport a voice', () => {
    const motion = createVoiceMotion(42); motion.advance(0);
    for (let i=1;i<=600;i++) motion.advance(i/60,1);
    const before=motion.at('pad'); motion.advance(10+1/60,3);
    const after=motion.at('pad');
    expect(Math.hypot(before.x-after.x,before.y-after.y)).toBeLessThan(0.01);
    motion.advance(1000,3);
    const resume=motion.at('pad');
    expect(Math.hypot(after.x-resume.x,after.y-resume.y)).toBeLessThan(0.08);
});

test('nearby frames remain continuous across random waypoint joins', () => {
    for(let t=0;t<120;t+=0.01){
        const a=voicePath('pad',t,42),b=voicePath('pad',t+0.01,42);
        expect(Math.hypot(b.x-a.x,b.y-a.y)).toBeLessThan(0.003);
    }
});
