// Cooperatively yield between blocks without recursively nesting zero-delay
// timers. One private posted task (or explicit stall timer) can be outstanding.
export class WorkerTaskPump {
  constructor(run,{makeChannel=()=>new MessageChannel(),setTimer=(fn,delay)=>setTimeout(fn,delay),clearTimer=id=>clearTimeout(id)}={}){
    this.run=run;this.setTimer=setTimer;this.clearTimer=clearTimer;this.channel=makeChannel();
    this.pending=false;this.timer=null;this.disposed=false;this.posted=0;this.handled=0;this.waits=0;
    this.channel.port1.onmessage=()=>{this.pending=false;if(this.disposed)return;this.handled++;this.run();};
  }
  schedule(delay=0){
    if(this.disposed||this.pending||this.timer!==null)return false;
    if(!Number.isFinite(delay)||delay<0)throw Error('Invalid pump delay');
    if(delay>0){this.waits++;this.timer=this.setTimer(()=>{this.timer=null;this.schedule();},delay);}
    else{this.pending=true;this.posted++;this.channel.port2.postMessage(0);}
    return true;
  }
  snapshot(){return {kind:'message-channel',pendingTask:this.pending,waitingForStall:this.timer!==null,postedTasks:this.posted,handledTasks:this.handled,stallTimers:this.waits,disposed:this.disposed};}
  dispose(){if(this.disposed)return;this.disposed=true;if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;this.pending=false;this.channel.port1.close();this.channel.port2.close();}
}
