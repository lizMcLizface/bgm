// Sound families for the FM7 suite, and how a ROM voice's name places it in one (used only to
// group the local cartridges for the statistics; the names themselves are not kept).
export const FAMILIES=[
 {id:'keys',words:['PIANO','E.P','GRAND','HONKY','HARPSI','CLAV','CLV','SYN-PIANO','TOY']},
 {id:'organ',words:['ORGAN','ORG','PIPES','CALIOPE','ACCORDION']},
 {id:'brass',words:['BRASS','BRS','HORN','TRUMPET','TBONE']},
 {id:'strings',words:['STRING','STRG','STGS','STG','BOW','VIOLA','ORCH']},
 {id:'winds',words:['FLUTE','PICCOLO','OBOE','CLARINET','SAX','BASSOON','RECORDER','HARMONICA','HRMNCA','PAN','WHISTLE','WHISL']},
 {id:'voices',words:['VOICE','VOX']},
 {id:'plucks',words:['GUIT','GTR','KOTO','SITAR','LUTE','BANJO','HARP','PIZZ']},
 {id:'bass',words:['BASS','FRETLESS']},
 {id:'mallets',words:['VIBE','MARIMBA','MARIM','XYLO','GLOKEN','CELESTE','CHIME','BELL','STEEL','GONG']},
 {id:'percussion',words:['TIMPANI','COW','BLOCK','LOG','DRM','SNAR','FLEXA','CONGA']},
 {id:'lead',words:['LEAD','SYNTH','PRC','HEAVY']},
 {id:'fx',words:['TRAIN','TAKE','LASER','DESCENT','WAR','PRIX','HELENS','EXPLOSION','WASP','WATER','SHIMMER','EVOLUTION','SWP','RISE','BOAR','GOTCHA','MULTI','ERUPT']},
];
// earlier entries win for combinations like HARP-FLUTE (plucks) or STRG-CHIME (strings),
// except that BASSOON is a wind and HARPSICHORD a keyboard
export function family(name){
 const n=name.toUpperCase();
 if(n.includes('BASSOON'))return 'winds';
 if(n.includes('HARPSI'))return 'keys';
 let best=null,at=Infinity;
 for(const f of FAMILIES)for(const w of f.words){const i=n.indexOf(w);if(i>=0&&i<at){at=i;best=f.id;}}
 return best??'lead';
}
