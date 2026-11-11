// Explicit primitive reference adapter; this is not the complete Tape chain.
export const TAPE_SHAPER_PROFILE='chromium-2x-e14de735-v1';
export function validateTapeShaperSpec(raw){const c=JSON.parse(JSON.stringify(raw));if(c?.version!==1||c.profile!==TAPE_SHAPER_PROFILE||!['linear','tape'].includes(c.curve)||typeof c.drive!=='number'||!Number.isFinite(c.drive)||c.drive<0||c.drive>1)throw Error('Invalid Tape shaper reference profile');return c;}
export const tapeShaperSpec=(drive=0,curve='tape')=>validateTapeShaperSpec({version:1,profile:TAPE_SHAPER_PROFILE,curve,drive});
export class OwnedTapeShaper{
 constructor(engine,spec,rate){if(!Number.isInteger(rate)||rate<8000||rate>192000||engine.tape_shaper_api()!==1)throw Error('Tape shaper ABI/rate');this.e=engine;this.spec=validateTapeShaperSpec(spec);this.handle=engine.tape_shaper_new(rate,this.spec.drive,Number(this.spec.curve==='linear'));if(!this.handle)throw Error('Tape shaper preparation failed');this.refresh();}
 alive(){if(!this.handle)throw Error('Disposed Tape shaper');}
 refresh(){this.alive();this.memory=this.e.memory.buffer;this.input=[0,1].map(ch=>new Float32Array(this.memory,this.e.tape_shaper_input(this.handle,ch),2048));this.output=[0,1].map(ch=>new Float32Array(this.memory,this.e.tape_shaper_output(this.handle,ch),2048));[this.left,this.right]=this.output;}
 render(n,channels=2){this.alive();if(!Number.isInteger(n)||n<0||n>2048||![1,2].includes(channels))throw Error('Tape shaper block/channel bounds');if(this.memory!==this.e.memory.buffer)throw Error('Tape shaper memory grew; refresh outside render');if(!this.e.tape_shaper_render(this.handle,n,channels))throw Error('Tape shaper render rejected');}
 reset(){this.alive();this.e.tape_shaper_reset(this.handle);}
 stats(){this.alive();return {peak:this.e.tape_shaper_stat(this.handle,0),frame:this.e.tape_shaper_stat(this.handle,1),groupDelayFrames:this.e.tape_shaper_stat(this.handle,2)};}
 dispose(){if(this.handle){this.e.tape_shaper_free(this.handle);this.handle=0;this.input=this.output=this.left=this.right=this.memory=null;}}
}
