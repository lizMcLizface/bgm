export const INSTRUMENT_DISTORTION_CELLS_PROFILE='original-instrument-distortion-literal-cells-v1';
const boundedFrame=n=>Number.isSafeInteger(n)&&n>=0&&n<=2**40-128&&n%128===0;
export class OwnedInstrumentDistortionCells{
 constructor(e,rate,{channels=2}={}){if(e.distortion_cells_api?.()!==1||!Number.isInteger(rate)||rate<8000||rate>192000||![1,2].includes(channels))throw Error('Literal-cell Distortion ABI/rate/layout differs');this.e=e;this.rate=rate;this.channels=channels;this.handle=e.distortion_cells_new(rate,channels);if(!this.handle)throw Error('Literal-cell allocation refused');this.memory=e.memory.buffer;this.input=[0,1].map(c=>new Float32Array(this.memory,e.distortion_cells_input(this.handle,c),128));this.output=[0,1].map(c=>new Float32Array(this.memory,e.distortion_cells_output(this.handle,c),128));this.wet=[0,1].map(c=>new Float32Array(this.memory,e.distortion_cells_wet(this.handle,c),128));}
 alive(){if(!this.handle)throw Error('Literal-cell Distortion disposed');if(this.e.memory.buffer!==this.memory)throw Error('Literal-cell Distortion memory changed');}
 call(op,...args){this.alive();if(!this.e['distortion_cells_'+op](this.handle,...args))throw Error('Literal-cell '+op+' refused');}
 time(frame){if(!boundedFrame(frame))throw Error('Literal-cell canonical frame required');return frame/this.rate;}
 initial(kind,value,frame=0){this.call('initial',kind,value,frame,this.time(frame));}
 prepare(origin=0){this.call('prepare',origin);}
 sync(frame){this.time(frame);this.call('sync',frame);}
 enqueue(kind,value,frame){this.call('enqueue',kind,value,frame,this.time(frame));}
 commit(){this.call('commit');}
 capacity(kind,count){this.alive();return this.e.distortion_cells_capacity(this.handle,kind,count)===1;}
 render(channels=this.channels,{pulled=true}={}){if(typeof pulled!=='boolean')throw Error('Literal-cell pulled Boolean required');this.call('render',channels,+pulled);}
 cell(index,drive){this.alive();return this.e.distortion_cells_cell(index,drive);}
 shape(input,drive){this.alive();return this.e.distortion_cells_shape(input,drive);}
 stat(i){this.alive();return this.e.distortion_cells_stat(this.handle,i);}
 stats(){return Object.fromEntries(['frame','peak','calls','renderedFrames','unpulledFrames','applied','rejected','drive','queued','curveAssignments','ready','origin','dryTarget','wetTarget','initialSteps'].map((k,i)=>[k,this.stat(i)]));}
 dispose(){if(this.handle){this.e.distortion_cells_free(this.handle);this.handle=0;this.memory=this.input=this.output=this.wet=null;}}
}
