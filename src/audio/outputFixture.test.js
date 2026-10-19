import {outputFixture,outputWav} from './outputFixture';
it('creates a bounded finite seamless stereo loop with identical repeatable samples',()=>{
 const a=outputFixture(8000),b=outputFixture(8000);expect(a.channels).toEqual(b.channels);for(const ch of a.channels){expect(ch.length).toBe(64000);for(const v of ch){expect(Number.isFinite(v)).toBe(true);expect(Math.abs(v)).toBeLessThan(.09);}expect(Math.abs(ch[0]-ch.at(-1))).toBeLessThan(.002);}
});
it('encodes the same samples into stereo PCM16 without normalization',()=>{
 const a=outputFixture(8000,.1),view=new DataView(outputWav(a));expect(view.getUint16(22,true)).toBe(2);expect(view.getUint32(24,true)).toBe(8000);expect(view.getUint32(40,true)).toBe(a.channels[0].length*4);
 for(let i=0;i<a.channels[0].length;i++)for(let c=0;c<2;c++)expect(Math.abs(view.getInt16(44+i*4+c*2,true)/32767-a.channels[c][i])).toBeLessThan(1/32767);
});
it('rejects invalid allocations',()=>{expect(()=>outputFixture(1)).toThrow();expect(()=>outputFixture(48000,Infinity)).toThrow();});
