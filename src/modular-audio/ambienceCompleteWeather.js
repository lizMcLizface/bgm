import processorUrl from '../app/engine/weatherLiveOwned.worklet.js?worker&url';
import {weatherBedSpec} from './ownedWeatherBed.js';
import {loadWeatherWorkletAssets} from './ownedWeatherWorklet.js';
const modules=new WeakMap(),ids=['rain','thunder','waves'],layers=[0,1,3];
const validTime=t=>typeof t==='number'&&Number.isFinite(t)&&t>=0&&t<=137438953;
const issue=(phase,error)=>({phase,name:error?.name??'Error',message:error?.message??String(error)});
const shapeArray=(shape,levels,id)=>[shape[id].distance,shape[id].shelter??0,shape[id].width,shape[id].pan,levels[id]??0];
export async function prepareAmbienceCompleteWeather(context,{load=loadWeatherWorkletAssets,Node=globalThis.AudioWorkletNode,timers=globalThis,deadlineMs=5000}={}) {
    if(typeof Node!=='function'||!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>5000)throw Error('Invalid complete weather preparation');
    const assets=await load();
    if(!modules.has(context)){const promise=context.audioWorklet.addModule(processorUrl);modules.set(context,promise);promise.catch(()=>modules.delete(context));}
    await modules.get(context);
    return (session,{seed=1}={})=>{if(session.context!==context)throw Error('Complete weather belongs to another context');return new AmbienceCompleteWeather(session,assets,{seed,Node,timers,deadlineMs});};
}
/** At most four actual weather nodes may overlap behind three private unity
 * bridges. Topology owners exist only while actual source nodes are retained.
 * Each old source ACK precedes detachment; a bed never retires another bed. */
export class AmbienceCompleteWeather {
    constructor(session,assets,{seed=1,Node=globalThis.AudioWorkletNode,timers=globalThis,deadlineMs=5000}={}) {
        if(!session?.context||!assets?.module||typeof Node!=='function'||!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>5000)throw Error('Invalid complete weather source group');
        this.session=session;this.context=session.context;this.assets=assets;this.seed=seed;this.Node=Node;this.timers=timers;this.deadlineMs=deadlineMs;this.nodes=new Set();this.bindings=[];this.bridges=[];this.current=null;this.error=null;this.closed=false;this.next=0;this.tail=Promise.resolve();this.history=Array(32).fill(null);this.historyCount=0;this.historyNext=0;
    }
    alive(){if(this.closed||this.error)throw this.error??Error('Complete weather closed');}
    ordered(run){const result=this.tail.then(run);this.tail=result.catch(error=>{this.error??=error;});return result;}
    setState(shape,levels) {
        this.alive();weatherBedSpec(this.context.sampleRate,shape,levels,this.seed);this.shape=structuredClone(shape);this.levels={...levels};
        const source=this.current,copyShape=this.shape,copyLevels=this.levels;if(!source)return Promise.resolve();
        return this.ordered(()=>this.request(source,'state',{shape:copyShape,levels:copyLevels}));
    }
    async attach() {
        if(this.detachment)await this.detachment;
        if(this.bindings.length)return;
        try{for(let i=0;i<3;i++){await this.session.ensureLayer(layers[i],{shape:shapeArray(this.shape,this.levels,ids[i])});const bridge=this.context.createGain();this.bridges.push(bridge);this.bindings.push(await this.session.attachSource(layers[i],bridge));}}
        catch(error){const cleanup=await this.detach();error.diagnostics={...(error.diagnostics??{}),weatherAttachmentCleanup:cleanup};throw error;}
    }
    start(time) {
        this.alive();if(!validTime(time)||!this.shape)throw Error('Weather state and valid start time required');
        if(this.nodes.size>=4)throw Error('Complete weather overlap capacity');
        // Reserve before asynchronous preparation; rapid starts cannot overbook.
        const source={id:++this.next,node:null,pending:new Map(),request:0,phase:'reserved',timer:null,readyTimer:null,error:null,edges:[],retirement:null};this.nodes.add(source);this.current=source;
        return this.ordered(async()=>{
            try{await this.attach();if(source.cancelBeforeStart){const cleanup=await this.retire(source);return{cancelled:true,cleanup};}if(this.closed)throw Error('Complete weather closed during preparation');
                const startFrame=Math.round(Math.max(time,this.context.currentTime)*this.context.sampleRate),spec=weatherBedSpec(this.context.sampleRate,this.shape,this.levels,this.seed);
                source.ready=new Promise((resolve,reject)=>{source.readyResolve=resolve;source.readyReject=reject;});source.ready.catch(()=>{});
                source.readyTimer=this.timers.setTimeout(()=>source.readyReject(Error('Complete weather startup did not acknowledge')),this.deadlineMs);
                source.node=new this.Node(this.context,'calmbgm-normal-owned-weather',{numberOfInputs:0,numberOfOutputs:3,outputChannelCount:[2,2,2],processorOptions:{module:this.assets.module,spec,startFrame,sourceVersion:this.assets.version}});
                source.node.port.onmessage=({data})=>this.receive(source,data);
                source.node.onprocessorerror=()=>this.failed(source,Error('Complete weather processor failed'));
                for(let i=0;i<3;i++){source.node.connect(this.bridges[i],i,0);source.edges.push({destination:this.bridges[i],output:i});}
                await source.ready;this.timers.clearTimeout(source.readyTimer);source.phase='active';source.startFrame=startFrame;return {id:source.id,startFrame};
            }catch(error){this.timers.clearTimeout(source.readyTimer);source.error=error;const cleanup=await this.retire(source);error.diagnostics={...(error.diagnostics??{}),weatherSourceCleanup:cleanup};throw error;}
        });
    }
    receive(source,data) {
        if(data.type==='ready'){source.readyResolve?.(data);return;}
        if(data.type==='disposed'){source.disposeResolve?.(data);return;}
        if(data.type==='error'){this.failed(source,Error(data.error??data.message??'Weather source failed'));return;}
        const pending=source.pending.get(data.request);if(pending){this.timers.clearTimeout(pending.timer);source.pending.delete(data.request);pending.resolve(data);}
    }
    failed(source,error) {
        source.error??=error;this.error??=error;source.readyReject?.(error);
        for(const pending of source.pending.values()){this.timers.clearTimeout(pending.timer);pending.reject(error);}source.pending.clear();
        void this.retire(source);
    }
    request(source,type,values={}) {
        if(!source.node||source.error||source.retirement)return Promise.reject(source.error??Error('Weather source unavailable'));
        if(source.pending.size>=64)return Promise.reject(Error('Complete weather request capacity'));
        const request=++source.request;
        return new Promise((resolve,reject)=>{const pending={resolve,reject,timer:this.timers.setTimeout(()=>{source.pending.delete(request);reject(Error('Complete weather '+type+' did not acknowledge'));},this.deadlineMs)};source.pending.set(request,pending);try{source.node.port.postMessage({type,...values,request});}catch(error){this.timers.clearTimeout(pending.timer);source.pending.delete(request);reject(error);}});
    }
    stop(time) {
        this.alive();if(!validTime(time)||time-this.context.currentTime>86400)throw Error('Invalid bounded weather stop time');
        const source=this.current;if(!source)return Promise.resolve({acknowledged:true,empty:true});this.current=null;
        if(!source.node){source.cancelBeforeStart=true;source.phase='cancelled-before-start';return this.ordered(()=>this.retire(source));}
        source.phase='stop-scheduled';
        source.stopped=new Promise(resolve=>{source.stopResolve=resolve;});
        source.timer=this.timers.setTimeout(()=>{source.timer=null;void this.ordered(()=>this.retire(source)).then(source.stopResolve,result=>source.stopResolve({acknowledged:false,error:result.message}));},Math.max(0,time-this.context.currentTime)*1000+30);
        return source.stopped;
    }
    detach() {
        if(this.detachment)return this.detachment;
        this.detachment=(async()=>{const errors=[];
        for(const binding of [...this.bindings].reverse())try{await this.session.cancelSource(binding.owner);}catch(error){errors.push(issue('weather topology cancellation',error));}
        if(!errors.length){this.bindings=[];for(const bridge of this.bridges)try{bridge.disconnect();}catch(error){errors.push(issue('weather bridge disconnect',error));}this.bridges=[];}
        return {clean:errors.length===0,errors};})();
        this.detachment.finally(()=>{this.detachment=null;});return this.detachment;
    }
    retire(source) {
        if(source.retirement)return source.retirement;
        source.phase='retiring';this.timers.clearTimeout(source.timer);this.timers.clearTimeout(source.readyTimer);
        return source.retirement=(async()=>{
            const errors=[];let acknowledged=!source.node;
            for(const p of source.pending.values()){this.timers.clearTimeout(p.timer);p.reject(Error('Weather source retiring'));}source.pending.clear();
            if(source.node){let timer;acknowledged=await new Promise(resolve=>{source.disposeResolve=()=>resolve(true);timer=this.timers.setTimeout(()=>resolve(false),this.deadlineMs);try{source.node.port.postMessage({type:'dispose'});}catch(error){errors.push(issue('weather dispose send',error));resolve(false);}});this.timers.clearTimeout(timer);
                if(acknowledged){for(const edge of source.edges)try{source.node.disconnect(edge.destination,edge.output,0);}catch(error){errors.push(issue('weather private source edge',error));}source.node.port.onmessage=null;source.node.onprocessorerror=null;source.node.port.close();}
                else errors.push({phase:'weather source retirement',name:'AcknowledgementError',message:'Weather source dispose did not acknowledge; topology retained'});
            }
            if(acknowledged&&errors.length===0)this.nodes.delete(source);
            if(this.current===source)this.current=null;
            if(this.nodes.size===0){const detached=await this.detach();errors.push(...detached.errors);}
            source.phase=errors.length?'quarantined':'retired';const receipt={id:source.id,acknowledged,clean:errors.length===0,errors};this.history[this.historyNext]=receipt;this.historyNext=(this.historyNext+1)%32;this.historyCount=Math.min(this.historyCount+1,32);source.stopResolve?.(receipt);return receipt;
        })();
    }
    status(){return {profile:'acknowledged-three-stem-weather-group-v1',closed:this.closed,error:this.error?.message??null,nodes:[...this.nodes].map(s=>({id:s.id,phase:s.phase,startFrame:s.startFrame??null,pending:s.pending.size,error:s.error?.message??null})),bindings:this.bindings.map(x=>({...x})),receipts:this.historyCount,receiptCapacity:32};}
    dispose(){if(this.disposal)return this.disposal;this.closed=true;this.current=null;for(const source of this.nodes){this.timers.clearTimeout(source.timer);source.readyReject?.(Error('Weather group retiring'));}return this.disposal=this.tail.then(async()=>{const sources=[];for(const source of [...this.nodes])sources.push(await this.retire(source));return {acknowledged:sources.every(x=>x.acknowledged),clean:sources.every(x=>x.clean)&&this.bindings.length===0,sources,quarantined:this.nodes.size};});}
}
