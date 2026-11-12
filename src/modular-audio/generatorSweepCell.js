import {SweepFilter,SWEEP_OPEN} from '../app/engine/sweepFilter.js';
const roots=new WeakMap(),MAX_BORROWS=16;
const refusal=message=>Object.assign(Error(message),{code:'GENERATOR_SWEEP_REFUSED'});
const native=(node,context)=>node?.context===context&&typeof node.connect==='function'&&typeof node.disconnect==='function';
/** Same Native construction/control order as SweepFilter's constructor. The
 * original prototype (including set/isOpen) is reused, never reimplemented.
 * Every allocated Native node is journaled before another fallible operation. */
function construct(context){const sweep=Object.create(SweepFilter.prototype),owned=[];try{sweep.context=context;sweep.high=context.createBiquadFilter();owned.push(sweep.high);sweep.high.type='highpass';sweep.low=context.createBiquadFilter();owned.push(sweep.low);sweep.low.type='lowpass';sweep.high.connect(sweep.low);sweep.set(SWEEP_OPEN,0);sweep.input=sweep.high;sweep.output=sweep.low;return sweep;}catch(primary){const errors=[];for(const node of owned.slice().reverse())try{node.disconnect();}catch(error){errors.push(error);}if(errors.length){primary.cleanupError=new AggregateError(errors,'Sweep partial-constructor cleanup failed');Object.defineProperty(primary,'ownedSweepNodes',{value:owned});}throw primary;}}
/** One explicit stable-master owner per Generator, independent of source
 * bundles. Candidate/successor borrows never dispose the root. No DSP exists
 * until the original synchronous first-use call. */
export function acquireGeneratorSweepCell(generator){
 const previous=roots.get(generator);if(previous){previous.check();return previous;}
 const g=generator,context=g?.AC,from=g?.output,to=g?.levelTrim;if(!context||context.state==='closed'||g.mixReturn||!native(from,context)||!native(to,context)||g.sweep)throw refusal('Main stable master without an unmanaged sweep required');
 const originalDescriptor=Object.getOwnPropertyDescriptor(g,'sweep'),borrows=new Set();let sweep=null,released=false,closing=null,failure=null,sequence=0,activation=0,closedByContext=false;const uncertain=[];let absentFailedAttemptEdges=0;
 const check=()=>{if(released||closing||failure)throw failure??refusal('Sweep owner is retired');if(context.state==='closed')throw refusal('Sweep context closed');if(g.output!==from||g.levelTrim!==to||sweep&&g.sweep!==sweep||!sweep&&g.sweep)throw refusal('Stable master authority changed');};
 const restorePointer=()=>{if(originalDescriptor)Object.defineProperty(g,'sweep',originalDescriptor);else delete g.sweep;};
 function activate(){check();if(sweep)return sweep;if(context.state!=='running'&&!(typeof context.startRendering==='function'&&context.state==='suspended'))throw refusal('Running or explicitly frozen Offline sweep clock required');let made;try{made=construct(context);}catch(primary){if(primary.cleanupError){uncertain.push(...(primary.ownedSweepNodes??[]));failure??=primary.cleanupError;}throw primary;}let removed=false,linkedInput=false,linkedOutput=false,pointer=false;
  try{removed=true;from.disconnect(to);linkedInput=true;from.connect(made.input);linkedOutput=true;made.output.connect(to);pointer=true;g.sweep=made;sweep=made;activation++;return made;}catch(primary){const errors=[];if(pointer)try{restorePointer();}catch(error){errors.push(error);}if(linkedOutput)try{made.output.disconnect(to);}catch(error){if(error.name==='InvalidAccessError')absentFailedAttemptEdges++;else errors.push(error);}if(linkedInput)try{from.disconnect(made.input);}catch(error){if(error.name==='InvalidAccessError')absentFailedAttemptEdges++;else errors.push(error);}if(removed)try{from.connect(to);}catch(error){errors.push(error);}for(const node of [made.low,made.high])try{node.disconnect();}catch(error){errors.push(error);}if(errors.length){uncertain.push(made.high,made.low);primary.cleanupError=new AggregateError(errors,'Sweep first-use rollback failed');failure??=primary.cleanupError;}throw primary;}
 }
 function dispose({contextClosed=false}={}){
  if(closing)return closing;if(!contextClosed&&context.state!=='closed'){check();if(borrows.size||g.isRunning!==false||g.ambienceRunning!==false||g.liveNotes?.size)throw refusal('Finish prepared routing borrows and playback before sweep teardown');}
  const errors=[];if(contextClosed||context.state==='closed'){closedByContext=true;released=true;try{restorePointer();}catch(error){errors.push(error);}sweep=null;uncertain.length=0;}else if(sweep){try{from.disconnect(sweep.input);}catch(error){errors.push(error);}try{sweep.output.disconnect(to);}catch(error){errors.push(error);}try{from.connect(to);}catch(error){errors.push(error);}for(const node of [sweep.low,sweep.high])try{node.disconnect();}catch(error){errors.push(error);}try{restorePointer();}catch(error){errors.push(error);}if(!errors.length){sweep=null;released=true;}}else released=true;
  try{context.removeEventListener?.('statechange',onClosed);}catch(error){errors.push(error);}if(errors.length)failure??=new AggregateError(errors,'Stable sweep terminal cleanup failed');closing=failure?Promise.reject(failure):Promise.resolve({version:1,profile:'generator-stable-sweep-terminal-v1',released:true,clean:true,contextClosed:closedByContext});closing.catch(()=>{});return closing;
 }
 const onClosed=()=>{if(context.state==='closed')dispose({contextClosed:true}).catch(()=>{});};context.addEventListener?.('statechange',onClosed);
 const api=Object.freeze({version:1,profile:'generator-stable-sweep-cell-v1',context,check,
  borrow({isCurrent=()=>true}={}){check();if(typeof isCurrent!=='function'||borrows.size>=MAX_BORROWS||sequence===0xffffffff)throw refusal('Sweep borrow capacity or authority differs');const record={id:++sequence,scope:null,closed:false};borrows.add(record);const live=()=>{check();if(record.closed||!record.scope||record.scope.snapshot().state!=='published'||isCurrent()!==true)throw refusal('Current published sweep borrow required');};return Object.freeze({version:1,context,owner:api,
   bind(scope){check();if(record.closed||record.scope||!scope||scope.context!==context||scope.value?.sweepOwner!==api||typeof scope.snapshot!=='function'||scope.snapshot().state!=='published')throw refusal('Exact sweep-root publication required');record.scope=scope;},
   activate(){live();return activate();},
   release(){if(record.closed)return Promise.resolve();record.closed=true;borrows.delete(record);return Promise.resolve();},
   snapshot:()=>({id:record.id,closed:record.closed,bound:!!record.scope})
  });},
  dispose,status:()=>({version:1,profile:'generator-stable-sweep-cell-v1',active:!!sweep,released,closedByContext,borrows:borrows.size,capacity:MAX_BORROWS,activations:activation,uncertainNativeNodes:uncertain.length,absentFailedAttemptEdges,quarantined:!!failure,error:failure?String(failure):null})});roots.set(g,api);return api;
}
export function generatorSweepCellStatus(generator){return roots.get(generator)?.status()??null;}
export function disposeGeneratorSweepCell(generator){return roots.get(generator)?.dispose()??Promise.resolve({released:true,clean:true,empty:true});}
