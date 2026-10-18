import {renderDescriptor} from './proceduralBuffers';
self.onmessage=({data})=>{try{const samples=renderDescriptor(data);self.postMessage({samples},[samples.buffer]);}catch(e){self.postMessage({error:e.message});}};
