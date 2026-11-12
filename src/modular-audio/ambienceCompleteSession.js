import {createAmbienceSpatialTopologySession} from './ambienceSpatialTopologyHost.js';
import {AmbienceCompleteQueue} from './ambienceCompleteLifecycle.js';
/** A new live lifecycle profile; accepted session methods/DSP are reused, while
 * diagnostics rotate instead of making4096 historical receipts a run limit. */
export async function createAmbienceCompleteSession(pool,options) {
    const session=await createAmbienceSpatialTopologySession(pool,options),queue=new AmbienceCompleteQueue();
    session.enqueue=(label,run)=>{session.alive();return queue.enqueue(label,run).catch(error=>{session.error??=error;throw error;});};
    Object.defineProperties(session,{tail:{get:()=>queue.tail},pending:{get:()=>queue.pending},sequence:{get:()=>queue.sequence}});
    const describe=session.describe.bind(session);session.describe=()=>({...describe(),profile:'bounded-complete-ambience-session-v1',liveQueue:queue.status()});
    return session;
}
