import {supportsRustPiano} from './rustPiano';
export const PIANO_PREPARATION_KEY='synths:piano:preparation';
export const PIANO_PREPARATION_EVENT='piano-preparation-change';
export function readPianoPreparation(){try{return localStorage.getItem(PIANO_PREPARATION_KEY)==='rust'?'rust':'legacy';}catch{return 'legacy';}}
export function writePianoPreparation(value){if(!['rust','legacy'].includes(value))throw Error('Invalid piano preparation mode.');try{localStorage.setItem(PIANO_PREPARATION_KEY,value);}catch{return false;}if(typeof window!=='undefined')window.dispatchEvent(new Event(PIANO_PREPARATION_EVENT));return true;}
export const pianoRendererFor=options=>readPianoPreparation()==='rust'&&supportsRustPiano(options)?'rust':'legacy';
let stats={rustNotes:0,rustBodies:0,legacyNotes:0,fallbacks:0,unsupported:0,lastError:null,version:null};
export function recordPianoPreparation({renderer='legacy',prepared=true,body=false,error=null,unsupported=false,version=null}={}){stats={...stats,[renderer==='rust'?'rustNotes':'legacyNotes']:stats[renderer==='rust'?'rustNotes':'legacyNotes']+(prepared?1:0),rustBodies:stats.rustBodies+(prepared&&renderer==='rust'&&body?1:0),fallbacks:stats.fallbacks+(error?1:0),unsupported:stats.unsupported+(prepared&&unsupported?1:0),lastError:error?String(error).slice(0,240):stats.lastError,version:version??stats.version};}
export const pianoPreparationStats=()=>({...stats,requested:readPianoPreparation()});
export function resetPianoPreparationStats(){stats={rustNotes:0,rustBodies:0,legacyNotes:0,fallbacks:0,unsupported:0,lastError:null,version:null};}
