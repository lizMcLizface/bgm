import {loadRustIowaPreparation} from './iowaPreparation';
import {iowaStrength} from './iowaCompiler';
// Async preparation boundary only. Each compile owns its Wasm memory/tables;
// the resulting graph retains only immutable numeric banks, never host handles.
export async function compileWithRustIowa(sources,compile,load=loadRustIowaPreparation){
 if(!sources.some(s=>s.source.kind==='iowa'))return compile(sources);
 const {renderer,version}=await load();const tables=[];
 try{return compile(sources.map(s=>{if(s.source.kind!=='iowa')return s;const table=renderer.createTable(s.source.patch.table,{settled:true});tables.push(table);return {...s,source:{...s.source,preparation:{backend:'rust',engineVersion:version},prepareIowaBank(_table,midi,velocity,rate,vibrato,id){const strength=iowaStrength(velocity);return table.prepareBank(midi,strength,rate,{vibrato,seed:midi*31+strength,id});}}};}));}
 finally{for(const table of tables)table.dispose();renderer.dispose();}
}
