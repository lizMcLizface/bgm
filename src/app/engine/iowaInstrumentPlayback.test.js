const state=vi.hoisted(()=>({player:null}));
vi.mock('./iowaModel/player',()=>({default:class {
 constructor(){state.player=this;this.ready=Promise.resolve();this.load=vi.fn();this.setRoom=vi.fn();this.setVibrato=vi.fn();this.start=vi.fn(()=>({id:1}));this.dispose=vi.fn();}
 connect(){return this;}
}}));
import IowaInstrument from './iowaInstrument';

it('retains a leased source effects route and releases it idempotently, including disposal',async()=>{
 const context={currentTime:100,createGain:()=>({gain:{value:0},disconnect:vi.fn()})},i=await IowaInstrument.create({context,preset:{iowa:'flute'}});
 expect(i.effectsAwake()).toBe(false);const first=i.holdSourceInput(),second=i.holdSourceInput();expect(i.effectsAwake()).toBe(true);first();first();expect(i.sourceInputs).toBe(1);second();expect(i.effectsAwake()).toBe(false);const after=i.holdSourceInput();i.dispose();after();expect(i.sourceInputs).toBe(0);i.dispose();expect(state.player.dispose).toHaveBeenCalledOnce();expect(()=>i.holdSourceInput()).toThrow('Disposed');
});
it('applies the measured instrument tuning and vibrato to scheduled and played notes',async()=>{
 const context={createGain:()=>({gain:{value:0},disconnect:vi.fn()})};
 const instrument=await IowaInstrument.create({context,preset:{iowa:'flute',tune:25,vibrato:.4}});
 expect(state.player.setVibrato).toHaveBeenCalledWith(.4);
 instrument.scheduleNote(60,1,1,.7,10);
 expect(state.player.start.mock.calls.at(-1)[3].tune).toBeCloseTo(2**(35/1200));
 instrument.startNote(60,.7);
 expect(state.player.start.mock.calls.at(-1)[3].tune).toBeCloseTo(2**(25/1200));
 instrument.applyPreset({iowa:'flute',vibrato:.8,tune:-10});
 expect(state.player.setVibrato).toHaveBeenLastCalledWith(.8);
 instrument.dispose();
});
