// Minimal WAV reader shared by the factory-data importers (tape audio, single-cycle wave sets).

/** Samples (−1…1) per channel and rate from an 8/16/24/32-bit integer or 32/64-bit float PCM WAV (plain or extensible). */
export function readWav(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input.buffer??input,input.byteOffset??0,input.byteLength);
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const tag=at=>String.fromCharCode(...bytes.subarray(at,at+4));
 if(bytes.length<12||tag(0)!=='RIFF'||tag(8)!=='WAVE')throw Error('Not a WAV file.');
 let fmt=null,data=null;
 for(let at=12;at+8<=bytes.length;){
  const id=tag(at),size=view.getUint32(at+4,true),body=at+8;
  if(id==='fmt '&&body+16<=bytes.length){
   let format=view.getUint16(body,true);
   // WAVE_FORMAT_EXTENSIBLE: the real format is the first two bytes of the sub-format GUID
   if(format===0xFFFE&&size>=26&&body+26<=bytes.length)format=view.getUint16(body+24,true);
   fmt={format,channels:view.getUint16(body+2,true),rate:view.getUint32(body+4,true),align:view.getUint16(body+12,true),bits:view.getUint16(body+14,true)};
  }
  // a streamed or truncated file may claim more data than it holds
  else if(id==='data'&&!data)data={start:body,size:Math.min(size,bytes.length-body)};
  if(id==='data'&&size>bytes.length-body)break;
  at=body+size+(size&1);
 }
 if(!fmt||!data)throw Error('WAV file without audio data.');
 const {format,channels,rate,bits}=fmt,float=format===3;
 if(format!==1&&!float)throw Error(`Unsupported WAV encoding (format ${format}); save it as PCM or float.`);
 if(!channels||!rate||![8,16,24,32,64].includes(bits)||(bits===64&&!float)||(float&&bits<32))throw Error(`Unsupported WAV layout (${bits}-bit, ${channels} channels).`);
 const width=bits/8,stride=Math.max(fmt.align,width*channels),frames=Math.floor(data.size/stride);
 const read=bits===8?p=>(bytes[p]-128)/128:bits===16?p=>view.getInt16(p,true)/32768:bits===24?p=>((view.getInt8(p+2)<<16)|(bytes[p+1]<<8)|bytes[p])/8388608
  :float?(bits===32?p=>view.getFloat32(p,true):p=>view.getFloat64(p,true)):p=>view.getInt32(p,true)/2147483648;
 const out=Array.from({length:channels},()=>new Float32Array(frames));
 for(let i=0,p=data.start;i<frames;i++,p+=stride)for(let c=0;c<channels;c++){const v=read(p+c*width);out[c][i]=Number.isFinite(v)?v:0;}
 const samples=channels===1?out[0]:Float32Array.from(out[0],(v,i)=>{let s=0;for(let c=0;c<channels;c++)s+=out[c][i];return s/channels;});
 return {sampleRate:rate,samples,channels:out};
}
