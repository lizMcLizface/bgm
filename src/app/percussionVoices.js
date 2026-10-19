// A percussion preset is one track voice: source architecture, instrument
// palette and balance. The groove remains a separate composition choice.
// Existing event indices and per-drum link fields are append-only compatibility
// storage; the public voice presents eleven named instrument roles.
import {DRUMS, DRUM_LABELS, defaultDrumKit} from './percussion';

const SLOTS = ['kick','brush','shaker','rim','hat','swish','tom','clap','ride','crash','bell'];
const CANONICAL = {punch:'kick',snare:'brush',sizzle:'hat'};
export const PERCUSSION_VOICES = {
    felt:{id:'felt',name:'Felt',model:'current',wasmOnly:false,description:'Soft kicks, brush taps and swishes, with gentle cymbals.',mapping:{},labels:{}},
    crisp:{id:'crisp',name:'Crisp',model:'current',wasmOnly:false,description:'Punchy kick, snare and bright hats with the familiar percussion palette.',mapping:{kick:'punch',brush:'snare',hat:'sizzle'},labels:{}},
    tr808:{id:'tr808',name:'808',model:'808',wasmOnly:true,description:'Electronic bass drum, snare, metallic hats, hand clap and a restrained cowbell.',
        mapping:{brush:'snare'},labels:{kick:'Bass drum',snare:'Snare',shaker:'Shaker',rim:'Rim / clave',hat:'Closed hat',swish:'Open hat',tom:'Tom',clap:'Hand clap',ride:'Ride cymbal',crash:'Crash cymbal',bell:'Cowbell'}},
    hand:{id:'hand',name:'Hand percussion',model:'hand',wasmOnly:true,description:'Rounded conga and bongo tones, wooden clicks, soft tambourine and seed textures.',mapping:{},
        labels:{kick:'Low conga',brush:'Muted conga',shaker:'Seed shaker',rim:'Woodblock',hat:'Tambourine tap',swish:'Tambourine shake',tom:'Bongo',clap:'Palm clap',ride:'Cabasa',crash:'Seed sweep',bell:'Claves'}},
};
export const percussionVoice = id => PERCUSSION_VOICES[id === '808' ? 'tr808' : id] ?? PERCUSSION_VOICES.felt;
export function drumForVoice(drum, id) {
    if (!id) return drum; // Raw legacy-slot reference fixtures stay available.
    const name = DRUMS[drum];if (!name) return drum;
    const slot = CANONICAL[name] ?? name;
    return DRUMS.indexOf(percussionVoice(id).mapping[slot] ?? slot);
}
export function percussionPads(id) {
    const voice = percussionVoice(id);
    return SLOTS.map(slot => {
        const drum = DRUMS.indexOf(slot), name = DRUMS[drumForVoice(drum,voice.id)];
        return {slot,drum,name,label:voice.labels[name] ?? DRUM_LABELS[name]};
    });
}
export function percussionPresetKit(id) {
    const kit = defaultDrumKit();
    if (percussionVoice(id).id === 'tr808') {
        // The metallic extras must sit below the main beat in a calm ensemble.
        for (const [name, level] of Object.entries({bell:.35,crash:.7,ride:.8,swish:.65,snare:.85,hat:.85,shaker:.8})) kit[name].level = level;
    }
    if (percussionVoice(id).id === 'hand') {
        kit.room=.1;
        for (const [name,level] of Object.entries({kick:.9,brush:.85,shaker:.75,rim:.65,hat:.55,swish:.5,tom:.8,clap:.7,ride:.55,crash:.4,bell:.55})) kit[name].level=level;
    }
    return kit;
}
export function percussionEdited(id, kit) {
    const reference = percussionPresetKit(id);
    return Math.abs(kit.room-reference.room)>1e-6 || percussionPads(id).some(({name}) => ['on','level','tone','decay'].some(key =>
        typeof reference[name][key] === 'boolean' ? reference[name][key] !== kit[name][key] : Math.abs(reference[name][key]-kit[name][key])>1e-6));
}
export function percussionKeyHint(id) {
    const keys=['A','S','D','F','G','H','J','K','L',';','’'];
    return percussionPads(id).map((p,i)=>keys[i]+' '+p.label.toLowerCase()).join(' · ');
}
