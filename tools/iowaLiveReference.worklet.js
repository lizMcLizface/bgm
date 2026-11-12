// Generated actual Iowa worklet; only import/registration and non-DSP receipt acknowledgements differ.
// The voices of /synths/iowa and of the generator's Iowa instruments (voice.js). Messages: { store, key, spec } once per note, then { on, id, key, gain, roll, ring, at, until,
// tune, slide } and { off, id }; { panic }. `at` and `until` are context seconds, for notes booked ahead, kept to the block. An offline render has no time for messages to arrive, so it
// hands everything over at once, in processorOptions.messages.
import { HeldVoice, DecayVoice, RollVoice } from '../src/app/engine/iowaModel/voice.js';

const MAX_VOICES = 32, MAX_STORED = 96;

class IowaVoices extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.voices = new Map();
        this.stored = new Map();
        this.booked = [];
        this.seed = 1;
        this.port.onmessage = ({ data }) => this.receive(data);
        for (const message of options?.processorOptions?.messages ?? []) this.receive(message);
    }
    receive(data) {
        if(data.dispose){this.voices.clear();this.stored.clear();this.booked.length=0;this.disposed=true;this.port.postMessage({type:'disposed',version:1,released:true,clean:true});return;}
        if(this.disposed)return;
        if (data.store) {
            if (this.stored.size >= MAX_STORED) this.stored.delete(this.stored.keys().next().value);
            this.stored.set(data.key, data.spec);
        } else if (data.on) {
            // the spec is fixed at booking, so a note still sounds if its table has left the store by the time it is due
            const spec = this.stored.get(data.key);
            if (!spec) return;
            if (data.at > currentTime) this.booked.push({ ...data, spec });
            else this.begin({ ...data, spec });
        } else if (data.off) this.end(this.voices.get(data.id));
        else if (data.panic) { this.voices.clear(); this.booked.length = 0; }
    }
    begin(data) {
        if (this.voices.size >= MAX_VOICES) this.voices.delete(this.voices.keys().next().value);
        this.seed = (this.seed * 48271) % 2147483647;
        const { spec, gain, roll, tune = 1, slide } = data;
        const voice = !spec.decay ? new HeldVoice(spec, sampleRate, gain, this.seed, tune, slide) : roll ? new RollVoice(spec, sampleRate, gain, roll, this.seed, tune) : new DecayVoice(spec, sampleRate, gain, tune);
        voice.ring = data.ring; voice.until = data.until;
        this.voices.set(data.id, voice);
    }
    /** A mallet note rings on when the key comes up; a roll stops hitting and rings on too, which is what its release does. */
    end(voice) {
        if (voice && (!voice.ring || voice instanceof RollVoice)) voice.release();
    }
    process(_inputs, outputs) {
        if(this.disposed){for(const bus of outputs)for(const plane of bus)plane.fill(0);return false;}
        const out = outputs[0][0], until = currentTime + out.length / sampleRate;
        out.fill(0);
        if (this.booked.length) {
            this.booked = this.booked.filter((data) => {
                if (data.at >= until) return true;
                this.begin(data);
                return false;
            });
        }
        for (const [id, voice] of this.voices) {
            if (voice.until !== undefined && voice.until < until) { this.end(voice); voice.until = undefined; }
            if (!voice.render(out, out.length)) this.voices.delete(id);
        }
        return true;
    }
}
class IowaLiveReference extends IowaVoices {
 constructor(options){super(options);this.port.onmessage=({data})=>{if(data.sync){this.port.postMessage({type:'sync',request:data.request,frame:currentFrame,stats:{active:this.voices.size,booked:this.booked.length,seed:this.seed}});return;}this.receive(data);if(data.trace)this.port.postMessage({type:'receipt',id:data.id??null,on:!!data.on,off:!!data.off,panic:!!data.panic,frame:currentFrame});};}
}
registerProcessor('iowa-live-reference',IowaLiveReference);
