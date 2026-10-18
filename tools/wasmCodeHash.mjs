import crypto from 'node:crypto';
// Ignore DWARF/name custom sections; compare the actual Wasm function bodies.
export function wasmCodeHash(bytes){
 if(bytes.length<8||bytes[0]!==0||bytes[1]!==97||bytes[2]!==115||bytes[3]!==109)throw Error('Invalid Wasm header.');
 let at=8;
 while(at<bytes.length){const id=bytes[at++];let size=0,shift=0,value;do{if(at>=bytes.length||shift>28)throw Error('Invalid Wasm section size.');value=bytes[at++];size+=(value&127)*2**shift;shift+=7;}while(value&128);if(at+size>bytes.length)throw Error('Truncated Wasm section.');if(id===10)return crypto.createHash('sha256').update(bytes.subarray(at,at+size)).digest('hex');at+=size;}
 throw Error('Missing Wasm code section.');
}
