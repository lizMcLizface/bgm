// How the levels page groups instruments. The catalogue's Keys & bells and Pads & textures families are too busy
// for one chart, so each is split in two here; every other family is one group.
export const GROUPS=[
 ['strings','Strings','strings'],['keys','Keys','keys'],['bells','Bells','keys'],['choir','Choir','choir'],['organs','Organs','organs'],
 ['drones','Drones','drones'],['bass','Bass','bass'],['plucks','Plucks & mallets','plucks'],['winds','Winds & brass','winds'],['leads','Synth leads','leads'],
 ['pads','Pads · synth','pads'],['pads-acoustic','Pads · pianos & measured','pads'],
];
const BELLS=/bell|chime|celest|rain drops|music box/i,ACOUSTIC=/grand|upright|piano|meantone|soft drama|studio concert|ravel|^measured/i;
export function groupOf(family,name){
 if(family==='keys')return BELLS.test(name)?'bells':'keys';
 if(family==='pads')return ACOUSTIC.test(name)?'pads-acoustic':'pads';
 return family;
}
