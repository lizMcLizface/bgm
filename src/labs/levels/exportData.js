import {NOTES,METRICS} from './measure';
const hz=midi=>Math.round(440*2**((midi-69)/12)*100)/100;
// One category's measurements across every velocity that has been measured, as plain JSON.
export function categoryExport(title,voices,all){
 const velocities={};
 for(const [vel,results] of Object.entries(all)){
  const rows=voices.filter(v=>results[v.id]).map(v=>[v.name,{id:v.id,engine:results[v.id].engine,single:results[v.id].single,chord:results[v.id].chord}]);
  if(rows.length)velocities[vel]=Object.fromEntries(rows);
 }
 return {category:title,unit:'dBFS',notes:NOTES.map(midi=>({midi,hz:hz(midi)})),measurements:METRICS.map(([id,label])=>({id,label})),velocities};
}
// The same data, one row per instrument, velocity, note set and note, for a spreadsheet.
export function categoryCsv(data){
 const lines=['velocity,instrument,engine,notes,midi,hz,'+METRICS.map(m=>m[0]).join(',')];
 for(const [vel,voices] of Object.entries(data.velocities))for(const [name,v] of Object.entries(voices))for(const set of ['single','chord'])
  data.notes.forEach((n,i)=>lines.push([vel,'"'+name.replace(/"/g,'""')+'"',v.engine,set,n.midi,n.hz,...METRICS.map(([m])=>v[set][m][i])].join(',')));
 return lines.join('\n');
}
