import {AmbienceSpatialResourceProducer} from './ambienceSpatialResourceProducer.js';
import {AmbienceLiveControlPlanner} from './ambienceLiveControlPlanner.js';
/** Live-only journal policy; inherited transport, forecast, SHA readback and
 * commit/cancel implementations remain the accepted resource producer. */
export class AmbienceLiveControlProducer extends AmbienceSpatialResourceProducer {
    open({slot,wave,sampleRate,period,offset=0}) {
        this.alive();
        if (!Number.isInteger(slot)||slot<0||slot>=16||!Number.isInteger(wave)||wave<0||wave>6) throw Error('Invalid bounded spatial stream');
        const key=slot*7+wave;
        if (this.streams.has(key)) throw Error('Spatial stream already exists');
        if (!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000) throw Error('Spatial stream rate');
        const planner=new AmbienceLiveControlPlanner(this.exports,{seed:wave===6?4411:6101+wave*53,period,offset});
        this.streams.set(key,{planner,sampleRate,wave,period,offset,pending:null,phaseCommitted:false});
    }
    receipts({slot,wave}) {
        this.alive();
        if (!Number.isInteger(slot)||slot<0||slot>=16||!Number.isInteger(wave)||wave<0||wave>6) throw Error('Invalid bounded spatial stream');
        const stream=this.streams.get(slot*7+wave);
        if (!stream) throw Error('Unknown spatial stream');
        return stream.planner.receiptStatus();
    }
}
