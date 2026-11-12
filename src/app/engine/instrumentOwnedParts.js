import NativeVoiceCompressor from '../../nodes/voiceCompressor.js';
import {Shimmer,Freeze} from '../../nodes/space.js';
import Reverb from '../../nodes/reverb.js';
import {SendReverb} from '../../nodes/sharedReverb.js';
import FdnRoom from './fdnRoom.js';
import {settleAudioCleanup} from '../../audio/constructorJournal.js';
const colourNodes=colour=>[colour?.input,colour?.delay,colour?.filter].filter(Boolean);
const closeNodes=(label,nodes)=>settleAudioCleanup(label,[...new Set(nodes.filter(Boolean))].map(node=>()=>node.disconnect()));
/** Explicit private fields of an already returned complete owner only. This
 * does NOT certify unreturned inner constructor prefixes or context-owned hubs. */
export function retireInstrumentPart(owner){
 if(owner instanceof NativeVoiceCompressor)return closeNodes('Returned Native voice compressor',[owner.node,owner.makeup]);
 if(owner instanceof Shimmer||owner instanceof Freeze){const active=!!owner.node?.port;return settleAudioCleanup('Returned Native Space stage',[()=>owner.dispose(),()=>owner.output.disconnect(),()=>{if(active)throw Object.assign(Error('Active Native Space processor has no typed terminal proof'),{code:'INSTRUMENT_NESTED_TERMINAL_UNPROVEN'});}]);}
 if(owner instanceof Reverb){owner.loadedType=null;return closeNodes('Returned Native Reverb',[owner.node,owner.dryGain.getNode(),owner.wetGain.getNode(),...colourNodes(owner.colour)]);}
 if(owner instanceof SendReverb)return closeNodes('Returned private Reverb send',[owner.dryGain.getNode(),owner.sendGain.getNode(),owner.levelGain.getNode(),...colourNodes(owner.colour)]);
 if(owner instanceof FdnRoom)return settleAudioCleanup('Returned FDN room',[()=>owner.dispose(),()=>closeNodes('Returned FDN private colour',[owner.highpass,...colourNodes(owner.colour)]),()=>owner.fallback?retireInstrumentPart(owner.fallback):undefined]);
 if(typeof owner?.dispose==='function')return owner.dispose();
 if(typeof owner?.getNode==='function')return closeNodes('Returned Instrument Native endpoint',[].concat(owner.getNode()));
 throw Error('Returned Instrument owner has no explicit private cleanup action');
}
