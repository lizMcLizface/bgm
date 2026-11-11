const state=vi.hoisted(()=>({player:null}));
vi.mock('./iowaModel/player',()=>({default:class {
 constructor(context,options){state.player=this;this.options=options;this.context=context;this.setHostAwake=vi.fn();this.armRuntime=vi.fn(async()=>{});this.ready=Promise.resolve();this.load=vi.fn();this.setRoom=vi.fn();this.setVibrato=vi.fn();this.start=vi.fn(()=>({id:1}));this.dispose=vi.fn();}
 connect(...args){this.connection=args;return this;}
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

it('forwards one prepared ordinary limiter factory and represents the actual final route without invented idle sleep',async()=>{
 const output={gain:{value:0},connect:vi.fn(),disconnect:vi.fn()},context={currentTime:100,createGain:()=>output},factory=vi.fn(),i=await IowaInstrument.create({context,preset:{iowa:'flute'},ordinaryCompressorFactory:factory});
 expect(state.player.options).toMatchObject({backend:'native',ordinaryCompressorFactory:factory});expect(state.player.connection).toEqual([output,{hostAwake:false}]);const destination={};i.connect(destination);expect(output.connect).toHaveBeenCalledWith(destination);expect(state.player.setHostAwake).toHaveBeenLastCalledWith(true);expect(i.effectsAwake()).toBe(false);expect(state.player.setHostAwake).toHaveBeenCalledOnce();await i.armRuntime();expect(state.player.armRuntime).toHaveBeenCalledOnce();i.disconnect();expect(state.player.setHostAwake).toHaveBeenLastCalledWith(false);i.dispose();i.dispose();expect(state.player.dispose).toHaveBeenCalledOnce();
});
