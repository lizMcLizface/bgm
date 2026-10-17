// Shared by procedural string and piano buffers; bounded across both models.
const buffers=new Map();let bytes=0;
const MAX_BYTES=24*1024*1024;
export const noteCacheStats=()=>({entries:buffers.size,bytes,maxBytes:MAX_BYTES});
export const clearNoteCache=()=>{buffers.clear();bytes=0;};
export function cachedNoteBuffer(context,key,render) {
    const id=JSON.stringify([context.sampleRate,key]);
    if(buffers.has(id)){const b=buffers.get(id);buffers.delete(id);buffers.set(id,b);return b;}
    const samples=render(),buffer=context.createBuffer(1,samples.length,context.sampleRate);buffer.getChannelData(0).set(samples);
    while(bytes+samples.byteLength>MAX_BYTES&&buffers.size){const first=buffers.keys().next().value;bytes-=buffers.get(first).length*4;buffers.delete(first);}
    if(samples.byteLength<=MAX_BYTES){buffers.set(id,buffer);bytes+=samples.byteLength;}
    return buffer;
}
