// Original step recipes. Numbers are one-based sixteenth notes; f = a flam.
const row=steps=>{const out=Array(16).fill('.');for(const s of steps.split(' ').filter(Boolean)){const n=parseInt(s,10);out[n-1]=s.endsWith('f')?'f':'x';}return out.join('');};
const beat=(id,name,category,bpm,rows,swing=.5)=>({id,name,category,bpm,swing,rows:Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,row(v)]))});
export const BEATS=[
 beat('four-floor','Four on the floor','House',124,{bd:'1 5 9 13',cp:'5 13',ch:'3 7 11 15',oh:'7 15',A:'1 9'}),
 beat('boom-bap','Boom bap','Hip-hop',88,{bd:'1 7 11',sd:'5 13',ch:'1 3 5 7 9 11 13 15',oh:'15',A:'5 13'},.57),
 beat('electro','Electro','Electro',118,{bd:'1 7 10 13',sd:'5 13',cp:'5 13 16',ch:'1 3 4 5 7 8 9 11 12 13 15 16',cb:'3 9 14',A:'1 5 9 13'}),
 beat('techno','Techno','Techno',132,{bd:'1 5 9 13',cp:'5 13',ch:'1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16',oh:'3 7 11 15',rs:'2 5 8 10 13',A:'3 7 11 15'}),
 beat('clave','Clave','Latin',112,{bd:'1 7 11',cl:'1 4 7 11 13',mc:'3 7 11 15',hc:'2 8 11',lc:'1 5 9 13',cb:'1 9',ma:'1 3 5 7 9 11 13 15'}),
 beat('slow-house','Slow house','House',108,{bd:'1 9 15',sd:'13',cp:'5 13',ch:'1 3 5 7 9 11 13 15',rd:'3 7 11 15',cr:'1',A:'1 9'}),
 beat('deep-pocket','Deep pocket','House',120,{bd:'1 5 9 13',cp:'5 13',rs:'4 10 16',ch:'1 3 6 7 9 11 14 15',oh:'11',A:'1 7 9 15'},.54),
 beat('garage-skip','Garage skip','House',130,{bd:'1 8 11',sd:'5 13',ch:'1 3 4 7 9 11 12 15',oh:'7 15',rs:'10 16',A:'1 5 11 13'},.61),
 beat('disco-ride','Disco ride','House',122,{bd:'1 5 9 13',sd:'5 13',rd:'1 3 5 7 9 11 13 15',ch:'2 4 6 8 10 12 14 16',oh:'7 15',cp:'13',A:'5 13'}),
 beat('acid-jack','Acid jack','House',126,{bd:'1 5 9 13',cp:'5 13',ch:'1 3 4 7 9 11 12 15',oh:'3 11',lt:'8 16',A:'1 7 9 15'},.56),
 beat('warehouse','Warehouse','Techno',138,{bd:'1 5 9 13',sd:'5 13',ch:'1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16',oh:'3 7 11 15',lt:'4 10 16',A:'1 5 9 13'}),
 beat('minimal-click','Minimal click','Techno',128,{bd:'1 5 9 13',rs:'3 8 11 14',ch:'1 4 7 9 12 15',oh:'15',A:'1 9'},.52),
 beat('broken-machine','Broken machine','Techno',134,{bd:'1 4 7 11 15',sd:'5 13',ch:'1 3 5 7 9 11 13 15',mt:'6 12 16',oh:'10',A:'1 7 11'}),
 beat('dub-pulse','Dub pulse','Techno',116,{bd:'1 5 9 13',rs:'5 13',ch:'3 7 11 15',oh:'15',lt:'8 14',A:'1 9'}),
 beat('robot-funk','Robot funk','Electro',112,{bd:'1 4 7 10 15',sd:'5 13',cb:'3 8 11 16',ch:'1 3 5 7 9 11 13 15',cp:'13',A:'1 7 13'},.53),
 beat('space-break','Space break','Electro',124,{bd:'1 7 10',sd:'5 13',cl:'4 11 16',ch:'1 3 4 7 9 11 12 15',oh:'15',A:'1 5 10 13'}),
 beat('miami-bass','Miami bass','Electro',132,{bd:'1 4 7 9 12 15',sd:'5 13',cp:'5 13',ch:'1 3 5 7 9 11 13 15',cb:'4 12',A:'1 9'}),
 beat('motorik','Motorik','Electro',120,{bd:'1 5 9 13',sd:'5 13',ch:'1 3 5 7 9 11 13 15',cy:'1',A:'1 9'}),
 beat('dusty-vinyl','Dusty vinyl','Hip-hop',78,{bd:'1 7 10',sd:'5 13',rs:'12 16',ch:'1 3 5 7 9 11 13 15',oh:'11',A:'5 13'},.6),
 beat('offbeat-kick','Offbeat kick','Hip-hop',92,{bd:'1 4 8 11 16',sd:'5 13',ch:'1 3 6 7 9 11 14 15',A:'1 5 11 13'},.58),
 beat('half-time','Half-time','Hip-hop',140,{bd:'1 7 11',sd:'9',ch:'1 3 5 7 9 11 13 14 15 16',oh:'7',A:'1 9'}),
 beat('trap-steps','Trap steps','Hip-hop',144,{bd:'1 7 12 15',sd:'9',cp:'9',ch:'1 3 5 6 7 9 11 13 14 15 16',oh:'4 12',A:'1 9'}),
 beat('breakbeat','Breakbeat','Breaks',132,{bd:'1 7 11',sd:'5 13',ch:'1 3 5 7 9 11 13 15',rs:'8 12 16',oh:'15',A:'1 5 11 13'}),
 beat('jungle-step','Jungle step','Breaks',164,{bd:'1 7 11',sd:'5 10 13 16',ch:'1 3 5 7 9 11 13 15',oh:'3 11',A:'5 13'}),
 beat('two-step','Two-step','Breaks',136,{bd:'1 8 11',sd:'5 13',ch:'1 3 4 7 9 11 12 15',rs:'6 16',oh:'15',A:'1 5 11 13'},.58),
 beat('big-beat','Big beat','Breaks',110,{bd:'1 4 7 11',sd:'5 13',cp:'5 13',ch:'1 3 5 7 9 11 13 15',cy:'1',lt:'16',A:'1 5 11 13'}),
 beat('bossa-wire','Bossa wire','Latin',104,{bd:'1 7 9 15',rs:'1 4 7 11 14',ch:'1 3 5 7 9 11 13 15',lc:'5 13',hc:'8 16',A:'1 9'}),
 beat('tumbao','Tumbao','Latin',116,{bd:'1 7 11 15',cl:'1 4 7 11 13',lc:'4 8 12 16',mc:'3 7 11 15',hc:'6 14',ma:'1 3 5 7 9 11 13 15',A:'1 7 11'}),
 beat('dembow','Dembow','Latin',96,{bd:'1 7 9 15',sd:'5 8 13 16',ch:'1 3 5 7 9 11 13 15',cl:'4 12',A:'1 9'}),
 beat('baile-step','Baile step','Latin',130,{bd:'1 4 7 11 14',sd:'5 13',cp:'3 8 11 16',ch:'1 3 5 7 9 11 13 15',lt:'10',A:'1 7 11'}),
 beat('uplifting-trance','Uplifting trance','Trance',138,{bd:'1 5 9 13',cp:'5 13',oh:'3 7 11 15',ch:'2 4 6 8 10 12 14 16',A:'1 5 9 13'}),
 beat('progressive-trance','Progressive trance','Trance',130,{bd:'1 5 9 13',cp:'5 13',oh:'3 7 11 15',ch:'2 4 6 8 10 12 14 16',rs:'8 16',A:'1 9'}),
 beat('tom-conversation','Tom conversation','Percussion',102,{bd:'1 9',lt:'1 7 12',mt:'4 10 15',ht:'3 8 14',ch:'1 3 5 7 9 11 13 15',A:'1 9'},.55),
 beat('flam-parade','Flam parade','Percussion',108,{bd:'1 9',sd:'5f 13f 16',lt:'7 15',ht:'4 12',ch:'1 3 5 7 9 11 13 15',A:'5 13'}),
];

const clone=rows=>({...rows});
function stage(base,name,changes={},omit=[]){const rows={...clone(base.rows),...Object.fromEntries(Object.entries(changes).map(([k,v])=>[k,row(v)]))};for(const key of omit)delete rows[key];return {name,rows};}
function arrangement(id,name,beatId,fill,chain=[0,0,1,1,2,2,1,3]){
 const base=BEATS.find(b=>b.id===beatId);
 return {id,name,category:base.category,bpm:base.bpm,swing:base.swing,chain,stages:[
  stage(base,'Intro',{},['sd','cp','oh','cb','cl','rs','lt','mt','ht','lc','mc','hc']),
  stage(base,'Groove'),
  stage(base,'Variation',{bd:'1 4 7 9 12 15',oh:'7 15',A:'1 5 9 13'}),
  stage(base,'Fill',fill),
  stage(base,'Breakdown',{},['bd','sd','cp']),
  stage(base,'Build',{sd:'5 11 13 14 15 16',ch:'1 3 5 7 9 11 13 14 15 16'}),
  stage(base,'Drop',{cy:'1',bd:'1 5 9 13',cp:'5 13'}),
  stage(base,'Turnaround',{sd:'5 13f 15 16',lt:'12 14',ht:'11',oh:'7',A:'1 9 13'}),
 ]};
}
const LONG=[0,0,1,1,2,2,1,3,4,4,5,5,6,6,2,7];
const FOUR=[1,2,1,3];
export const ARRANGEMENTS=[
 arrangement('house-lift','House lift','deep-pocket',{sd:'5 13 15 16',lt:'12 14',ht:'11'},LONG),
 arrangement('garage-night','Garage night','garage-skip',{sd:'5 12 13f 16',ch:'1 3 4 7 9 11 12 14 15 16'}),
 arrangement('disco-turn','Disco turnaround','disco-ride',{sd:'5 13 14 15 16',lt:'12',ht:'10'},FOUR),
 arrangement('acid-journey','Acid journey','acid-jack',{sd:'5 13f 15 16',lt:'10 12 14'},LONG),
 arrangement('warehouse-shift','Warehouse shift','warehouse',{sd:'5 9 11 13 14 15 16',lt:'12 16'},LONG),
 arrangement('dub-cycle','Dub cycle','dub-pulse',{rs:'5 12 13 16',lt:'10 14 15'}),
 arrangement('electro-story','Electro story','robot-funk',{sd:'5 13f 15',cb:'3 8 11 14 16',ht:'12 16'},LONG),
 arrangement('boom-bap-verse','Boom bap verse','boom-bap',{sd:'5 12 13f 16',bd:'1 7 10 15'},LONG),
 arrangement('trap-switch','Trap switch','trap-steps',{sd:'9 13 15 16',ch:'1 3 5 7 9 10 11 12 13 14 15 16'}),
 arrangement('breaks-round','Breaks round','breakbeat',{sd:'5 8 10 13f 15 16',bd:'1 7 11 14'},FOUR),
 arrangement('jungle-roll','Jungle roll','jungle-step',{sd:'5 8 10 12 13 14 15 16',bd:'1 7 11'},LONG),
 arrangement('trance-journey','Trance journey','uplifting-trance',{sd:'9 11 13 14 15 16',cp:'5 13'},LONG),
 arrangement('progressive-journey','Progressive journey','progressive-trance',{sd:'13 14 15 16',rs:'4 8 12 16'},LONG),
 arrangement('latin-circuit','Latin circuit','tumbao',{lc:'4 8 12 16',mc:'3 7 11 14',hc:'6 10 13 15',sd:'13f'},LONG),
];

/** An arrangement by id, or any single beat as a standard eight-stage one (chain: the Groove stage). */
export function arrangementFor(id){
 const found=ARRANGEMENTS.find(a=>a.id===id);if(found)return found;
 const beat=BEATS.find(b=>b.id===id);
 return beat?arrangement(beat.id,beat.name,beat.id,{sd:'5 13 15 16'},[1]):null;
}
