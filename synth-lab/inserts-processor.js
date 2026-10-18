class InsertsProcessor extends AudioWorkletProcessor {
 constructor({processorOptions:o}){super();this.failed=false;try{
  this.fx=new WebAssembly.Instance(o.module,{}).exports;if(this.fx.inserts_api()!==1)throw Error('Instrument inserts API mismatch.');this.fx.inserts_init(sampleRate);for(const p of o.parameters??[])this.fx.inserts_param(...p);this.fx.inserts_settle();
  const buffer=this.fx.memory.buffer;this.input=[0,1].map(ch=>new Float32Array(buffer,this.fx.inserts_input(ch),2048));this.output=[0,1].map(ch=>new Float32Array(buffer,this.fx.inserts_output(ch),2048));this.in128=this.input.map(v=>v.subarray(0,128));this.out128=this.output.map(v=>v.subarray(0,128));this.end=Number.isFinite(o.endFrame)?o.endFrame:null;this.rendered=0;this.frames=0;
  this.port.onmessage=({data})=>{try{if(data.type==='parameters')for(const p of data.values)this.fx.inserts_param(...p);if(data.type==='clear')this.fx.inserts_clear();if(data.type==='dispose')this.stop();}catch(e){this.fail(e);}};
 }catch(e){this.fail(e);}}
 stop(){this.failed=true;this.port.onmessage=null;this.port.close();this.fx=this.input=this.output=this.in128=this.out128=null;}
 fail(e){this.port.postMessage({type:'error',message:String(e)});this.stop();}
 process(inputs,outputs){if(this.failed)return false;try{const out=outputs[0];if(!out?.length)return true;const input=inputs[0];
  for(let at=0;at<out[0].length;at+=2048){const n=Math.min(2048,out[0].length-at);for(let ch=0;ch<2;ch++){const dst=n===128?this.in128[ch]:this.input[ch].subarray(0,n),src=input?.[ch]??input?.[0];if(src)dst.set(at===0&&n===src.length?src:src.subarray(at,at+n));else dst.fill(0);}this.fx.inserts_render(n);for(let ch=0;ch<out.length;ch++)out[ch].set(n===128?this.out128[Math.min(ch,1)]:this.output[Math.min(ch,1)].subarray(0,n),at);}
  this.rendered+=out[0].length;this.frames+=out[0].length;if(this.end===null&&this.frames>=sampleRate){this.frames=0;this.port.postMessage({type:'stats',peak:this.fx.inserts_stat(0),memory:this.fx.memory.buffer.byteLength});}if(this.end!==null&&this.rendered>=this.end){this.stop();return false;}return true;
 }catch(e){this.fail(e);return false;}}
}
registerProcessor('calmbgm-inserts',InsertsProcessor);
