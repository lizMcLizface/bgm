import {AUDIT_CASES,auditCase,measureAudio,auditWarnings,windowRms} from './audioAudit';
test('audit cases cover dynamics, registers, gates, chords, overload and cancellation deterministically',()=>{
 for(const role of ['lead','counter','pad','bass'])for(const id of AUDIT_CASES){const a=auditCase(id,role);expect(a).toEqual(auditCase(id,role));expect(a.notes.every(n=>n.midi>=0&&n.midi<=127&&n.duration>0&&n.velocity>0&&n.velocity<=1)).toBe(true);}
 expect(auditCase('steal').notes.length).toBeGreaterThan(8);expect(auditCase('silence').notes).toEqual([]);expect(auditCase('resume').actions.at(-1).type).toBe('resume');
});
test('measurements expose raw clipping/non-finite/DC and keep early and late tails separate',()=>{
 const a=Float32Array.from([1.2,-1.2,NaN,.2,0,0,0,0]),m=measureAudio([a],4,{lastGate:.5});
 expect(m.over).toBe(2);expect(m.nonFinite).toBe(1);expect(m.peak).toBeCloseTo(1.2);expect(m.dc).toBeCloseTo(.025);expect(m.earlyTailRms).toBeGreaterThan(0);expect(m.lateTailRms).toBe(0);
 expect(windowRms([new Float32Array(4)],4)).toBe(0);expect(auditWarnings({...m,id:'held'})).toHaveLength(3);
 expect(auditWarnings({...measureAudio([new Float32Array(8)],4),id:'silence'})).toEqual([]);
 expect(auditWarnings({...measureAudio([new Float32Array(8)],4),id:'cancel',afterCancelRms:.01})).toContain('Sound remains after cancellation / tail flush');
});

test('held glide fixture has only one attack per chord voice across all pitch destinations',()=>{
 const fixture=auditCase('held-glide','pad');expect(fixture.notes).toHaveLength(3);
 expect(new Set(fixture.notes.map(n=>n.time)).size).toBe(1);
 for(const note of fixture.notes){expect(note.duration).toBe(12);expect(note.pitchTargets).toHaveLength(8);expect(note.pitchTargets[0].midi).toBe(note.midi);expect(note.pitchTargets.at(-1).time).toBe(12);}
 expect(fixture.notes.some(n=>n.pitchTargets.some(p=>p.midi!==n.midi))).toBe(true);
});

test('bass held glides use one drone through new roots instead of a low chord that steals voices',()=>{
 const fixture=auditCase('held-glide','bass');expect(fixture.notes).toHaveLength(1);
 const note=fixture.notes[0];expect(note.midi).toBe(36);expect(note.duration).toBe(12);
 expect([...new Set(note.pitchTargets.map(p=>p.midi))]).toEqual([36,41,38]);
});
