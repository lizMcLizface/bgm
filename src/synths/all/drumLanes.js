import {DRUMS,DRUM_LABELS} from '../../app/percussion';
import {drumForVoice,percussionVoice} from '../../app/percussionVoices';
import {DRUM_TRACKS} from '../../app/drumMappings';
import {KITS} from '../drums/kits';

const extras=[['mt','Mid tom','tom'],['ht','High tom','tom'],['lc','Low conga','tom'],['mc','Mid conga','tom'],['hc','High conga','tom'],['cl','Claves','rim'],['tb','Tambourine','shaker']];
export const DRUM_LANES=[
 ...DRUMS.map((name,drum)=>({drum,name})),
 ...extras.map(([track,label,name])=>({track,label,drum:DRUMS.indexOf(name)})),
];
const extraTracks=new Set(extras.map(([track])=>track));
export const matchesDrumLane=(hit,lane)=>lane.track?hit.track===lane.track:hit.drum===lane.drum&&!extraTracks.has(hit.track);
export function drumLaneLabel(lane,sound,voice) {
 if(lane.track)return lane.label;
 const track=DRUM_TRACKS[sound?.synth]?.[lane.name];
 if(track)return KITS[sound.synth].tracks.find(([key])=>key===track)?.[2]??DRUM_LABELS[lane.name];
 const mapped=DRUMS[drumForVoice(lane.drum,voice)];
 return percussionVoice(voice).labels[mapped]??DRUM_LABELS[mapped];
}
