/** Separate original-law curve preparation. Caller owns the copied immutable data. */
export class OwnedTapeCurvePreparation{
 constructor(module){if(!(module instanceof WebAssembly.Module))throw Error('Verified Tape curve Wasm module required');this.e=new WebAssembly.Instance(module,{}).exports;this.handle=0;if(this.e.tape_curve_api()!==1)throw Error('Tape curve preparation ABI differs');this.handle=this.e.tape_curve_new();if(!this.handle)throw Error('Tape curve preparation allocation refused');}
 alive(){if(!this.handle)throw Error('Disposed Tape curve preparation');}
 prepare(drive){this.alive();if(typeof drive!=='number'||!Number.isFinite(drive)||drive<0||drive>1)throw Error('Tape drive must be finite in0..1');if(!this.e.tape_curve_prepare(this.handle,drive))throw Error('Tape curve preparation refused');return new Float32Array(this.e.memory.buffer,this.e.tape_curve_output(this.handle),2049).slice();}
 stats(){this.alive();return{drive:this.e.tape_curve_stat(this.handle,0),calls:this.e.tape_curve_stat(this.handle,1),points:this.e.tape_curve_stat(this.handle,2),memoryBytes:this.e.memory.buffer.byteLength};}
 dispose(){if(!this.handle)return;this.e.tape_curve_free(this.handle);this.handle=0;this.e=null;}
}
