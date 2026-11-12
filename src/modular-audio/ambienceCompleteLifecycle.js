const finiteTime=t=>typeof t==='number'&&Number.isFinite(t)&&t>=0&&t<=137438953;
/** Ordered live orchestration with a rolling diagnostic ring, not an event or
 * sample-history journal. A failed operation closes admission for this bed. */
export class AmbienceCompleteQueue {
    constructor() { this.tail=Promise.resolve();this.pending=0;this.sequence=0;this.retained=Array(256).fill(null);this.receiptNext=0;this.receiptCount=0;this.error=null;this.closed=false; }
    enqueue(label,run) {
        if(this.closed||this.error)throw this.error??Error('Complete Ambience queue closed');
        if(typeof label!=='string'||!label||label.length>80||typeof run!=='function'||this.pending>=64||this.sequence+this.pending>=Number.MAX_SAFE_INTEGER)throw Error('Complete Ambience queue admission capacity');
        this.pending++;
        const operation=this.tail.then(async()=>{if(this.closed||this.error)throw this.error??Error('Complete Ambience queue closed');const value=await run();this.retained[this.receiptNext]={sequence:++this.sequence,label};this.receiptNext=(this.receiptNext+1)%256;this.receiptCount=Math.min(this.receiptCount+1,256);return value;});
        this.tail=operation.catch(error=>{this.error??=error;});
        return operation.finally(()=>this.pending--);
    }
    async whenIdle() { await this.tail;if(this.error)throw this.error; }
    status() { return {pending:this.pending,total:this.sequence,retained:this.receiptCount,capacity:256,closed:this.closed,error:this.error?.message??null}; }
    close() { this.closed=true;return this.tail; }
}
/** Each actual Brownian constructor owns its own15-second wall timer. Capture
 * context time at that callback, and preserve it through queued preparation.
 * A mode change to Sine does not destroy the original walk or its refill timer. */
export class AmbienceWalkRefillOwner {
    constructor(session,{enqueue,timers=globalThis,onError=()=>{}}={}) {
        if(!session?.context||typeof enqueue!=='function'||typeof timers.setInterval!=='function'||typeof timers.clearInterval!=='function'||typeof onError!=='function')throw Error('Invalid complete Ambience refill owner');
        this.session=session;this.enqueue=enqueue;this.timers=timers;this.onError=onError;this.waves=new Map();this.closed=false;this.error=null;
    }
    register(wave,birth=this.session.bed.births.get(wave)) {
        if(this.closed||this.error)throw this.error??Error('Refill owner closed');
        if(!Number.isInteger(wave)||wave<0||wave>6||!finiteTime(birth))throw Error('Invalid Brownian refill constructor');
        if(this.waves.has(wave))return;
        const state={wave,birth,lastRefill:birth,inflight:false,coalesced:0,ticks:0,refills:0,timer:null};
        state.timer=this.timers.setInterval(()=>this.tick(state),15000);this.waves.set(wave,state);
    }
    tick(state) {
        if(this.closed||this.error)return;
        const at=this.session.context.currentTime;state.ticks++;
        if(!finiteTime(at)||at<state.lastRefill)return this.fail(Error('Invalid complete Ambience refill clock'));
        if(at<=state.lastRefill)return;
        if(at>state.lastRefill+90)return this.fail(Error('Complete Ambience refill exceeded retained ninety-second horizon'));
        if(state.inflight){state.coalesced++;return;}
        state.inflight=true;
        let task;try{task=this.enqueue('refill-'+state.wave,async()=>{
            if(this.closed)throw Error('Refill owner closed');
            if(this.session.context.currentTime>state.lastRefill+90)throw Error('Queued Ambience refill exhausted retained horizon');
            const stage=await this.session.pool.prepare(this.session.bed,state.wave,'refill',{at,signal:this.session.abort.signal});
            if(this.closed||this.session.context.currentTime>state.lastRefill+90){stage.cancel();throw Error('Ambience refill publication exceeded retained horizon');}
            await stage.refill();state.lastRefill=at;state.refills++;
        });}catch(error){state.inflight=false;this.fail(error);return;}
        Promise.resolve(task).catch(error=>{if(!this.closed)this.fail(error);}).finally(()=>{state.inflight=false;});
    }
    fail(error) { if(this.error||this.closed)return;this.error=error;for(const s of this.waves.values())this.timers.clearInterval(s.timer);this.onError(error); }
    status() { return {closed:this.closed,error:this.error?.message??null,waves:[...this.waves.values()].map(({timer,...s})=>({...s}))}; }
    dispose() { if(this.closed)return;this.closed=true;for(const s of this.waves.values())this.timers.clearInterval(s.timer); }
}

/** Uncertain asynchronous startup cannot be retried into the same context.
 * Late owned handles are still retired; their arrival cannot reopen admission. */
export function ambienceCompleteStartupDeadline(promise,{label,timers=globalThis,ms=20000,onLate=()=>{}}={}) {
    if(typeof label!=='string'||!Number.isInteger(ms)||ms<1||ms>20000||typeof onLate!=='function')throw Error('Invalid complete Ambience startup deadline');
    const status={label,state:'pending',lateOwners:0,lateCleanupError:null};
    return new Promise((resolve,reject)=>{let settled=false;const timer=timers.setTimeout(()=>{if(settled)return;settled=true;status.state='timed-out';reject(Object.assign(Error('Complete Ambience '+label+' startup deadline exceeded'),{mustRetireContext:true,diagnostics:{startupDeadline:status}}));},ms);
        Promise.resolve(promise).then(value=>{if(settled){status.lateOwners++;Promise.resolve().then(()=>onLate(value)).catch(error=>{status.lateCleanupError={name:error?.name??'Error',message:error?.message??String(error)};});return;}settled=true;status.state='ready';timers.clearTimeout(timer);resolve(value);},error=>{if(settled)return;settled=true;status.state='rejected';timers.clearTimeout(timer);reject(error);});
    });
}
