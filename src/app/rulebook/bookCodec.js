// URL wire IDs are append-only. Never derive them from UI/catalog order.
export const BOOK_RULE_IDS=[
  "music",
  "ambience",
  "second-lead",
  "duet-dialogue",
  "joint-counterpoint",
  "lead-presence",
  "backing-space",
  "motif-development",
  "phrase-planning",
  "melodic-grammar",
  "long-phrases",
  "phrase-contrast",
  "lead-busyness",
  "repeat-a-phrase",
  "note-resolution",
  "shared-rhythm",
  "groove-development",
  "backing-breath",
  "percussion-presence",
  "percussion-activity",
  "percussion-variation",
  "swing",
  "harmonic-language",
  "borrowed-chords",
  "chord-colour",
  "pentatonic-melody",
  "harmonic-parent",
  "human-timing",
  "human-dynamics",
  "melodic-slides",
  "held-pad-glides",
  "held-bass-glides",
  "pad-pitch-motion",
  "bass-pitch-motion",
  "chord-slides",
  "tempo-effects",
  "gate-envelopes",
  "note-connection",
  "held-expression",
  "note-articulation",
  "phrase-expression",
  "instrument-groove",
  "pitch-wander",
  "sections",
  "form-strategies",
  "tension-curves",
  "harmonic-pacing",
  "section-gestures",
  "lead-transitions",
  "lead-pickups",
  "shaped-endings",
  "section-cadences",
  "common-tone-bridges",
  "section-suspensions",
  "chord-colour-chance",
  "open-voicing",
  "bass-pedal",
  "bass-pedal-chance",
  "lead-leaps",
  "open-phrase-endings",
  "counter-presence",
  "section-tone",
  "human-detune",
  "percussion-sprinkle",
  "ambient-bed-drift",
  "ambient-layer-drift",
  "harmonic-drift"
];
export const BOOK_GROUP_IDS=[
  "pad-register",
  "bass-register",
  "lead-register",
  "counter-register",
  "pad-styles",
  "pad-pulses",
  "pad-arpeggios",
  "pad-directions",
  "pad-movement",
  "pad-size",
  "bass-styles",
  "section-reference",
  "ambient-drift-mode",
  "ambient-drift-period"
];
const PREFIX='b1.',LIMIT=12000;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
export function encodeBook(book){
 const bytes=[],uint=n=>{do{const next=n%128;n=Math.floor(n/128);bytes.push(next+(n?128:0));}while(n);};
 const json=value=>{const data=encoder.encode(JSON.stringify(value));uint(data.length);bytes.push(...data);};
 for(const section of ['rules','baseline','inherited']){
  const entries=BOOK_RULE_IDS.flatMap((id,index)=>book[section]?.[id]?[{index,entry:book[section][id]}]:[]);uint(entries.length);
  for(const {index,entry}of entries){const value=entry.value!==undefined;uint(index*4+(entry.enabled?1:0)+(value?2:0));if(value)json(entry.value);}
 }
 const groups=BOOK_GROUP_IDS.flatMap((id,index)=>Object.hasOwn(book.groups??{},id)?[{id,index}]:[]);uint(groups.length);
 for(const {id,index}of groups){const baseline=Object.hasOwn(book.groupBaseline??{},id);uint(index*2+(baseline?1:0));json(book.groups[id]);if(baseline)json(book.groupBaseline[id]);}
 const result=PREFIX+btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 if(result.length>LIMIT)throw Error('Rulebook URL too large');return result;
}
export function decodeBook(text){
 if(text.length>LIMIT||!text.startsWith(PREFIX))throw Error('Unsupported rulebook URL');
 const code=text.slice(PREFIX.length);if(!/^[A-Za-z0-9_-]+$/.test(code)||code.length%4===1)throw Error('Invalid rulebook encoding');
 const data=Uint8Array.from(atob(code.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));let at=0;
 const uint=()=>{let value=0,factor=1;for(let i=0;i<5;i++){if(at>=data.length)throw Error('Truncated rulebook');const byte=data[at++];value+=(byte%128)*factor;if(value>0x7fffffff)throw Error('Invalid rulebook integer');if(byte<128)return value;factor*=128;}throw Error('Invalid rulebook integer');};
 const json=()=>{const size=uint();if(size>data.length-at)throw Error('Truncated rule value');const text=decoder.decode(data.subarray(at,at+size));at+=size;return JSON.parse(text);};
 const book={version:1};
 for(const section of ['rules','baseline','inherited']){
  book[section]={};const count=uint();if(count>BOOK_RULE_IDS.length)throw Error('Invalid rule count');
  for(let i=0;i<count;i++){const token=uint(),id=BOOK_RULE_IDS[Math.floor(token/4)];if(!id||Object.hasOwn(book[section],id))throw Error('Invalid rule ID');book[section][id]={enabled:!!(token&1),...(token&2?{value:json()}:{})};}
 }
 book.groups={};book.groupBaseline={};const count=uint();if(count>BOOK_GROUP_IDS.length)throw Error('Invalid group count');
 for(let i=0;i<count;i++){const token=uint(),id=BOOK_GROUP_IDS[Math.floor(token/2)];if(!id||Object.hasOwn(book.groups,id))throw Error('Invalid group ID');book.groups[id]=json();if(token&1)book.groupBaseline[id]=json();}
 if(at!==data.length)throw Error('Unexpected rulebook data');return book;
}
