import {normalizeBank} from '../seq/bank';
import {emptyPattern,validPattern,foldAccent} from './kits';
import {RACK_PARAMS} from '../effects/params';

// An arrangement as a file: everything a drum page keeps, so a song can be saved, sent and opened on another machine
// without a link. The bank is written in full (all 64 patterns, step values, track settings, the song and its loop);
// a pattern with no notes is written as null. The page keeps its own copy in the browser's storage as before.
export const FORMAT='calmbgm-drum-arrangement',VERSION=1;
const MAX_BYTES=8*1024*1024;

const isEmpty=p=>!p.some(r=>r.some(Boolean));
const slug=text=>String(text||'arrangement').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'arrangement';

/** The file's text for a drum page's state; `values` and `rack` are the machine's sound and the effects rack. */
export function encodeArrangement(kit,{bank,values,rack,name}){
 const out={format:FORMAT,version:VERSION,kit:kit.id,name:String(name??'').slice(0,80),savedWith:'calmbgm',
  bank:{...bank,patterns:bank.patterns.map(p=>isEmpty(p)?null:p)},values,rack};
 return JSON.stringify(out);
}
/** A suggested file name. */
export const arrangementFileName=(kit,bank,name)=>`${slug(bank.title||name)}.${kit.id}.json`;

/**
 * What the file holds, checked: { bank, values, rack, name }. Throws an Error with a message fit for the page when the
 * file is not an arrangement, is for another machine, or has damaged patterns.
 */
export function decodeArrangement(kit,synth,text){
 if(typeof text!=='string'||text.length>MAX_BYTES)throw new Error('This file is too large to be an arrangement.');
 let data;
 try{data=JSON.parse(text);}catch{throw new Error('This file is not an arrangement (it is not valid JSON).');}
 if(!data||data.format!==FORMAT)throw new Error('This file is not a drum arrangement.');
 if(!Number.isInteger(data.version)||data.version>VERSION)throw new Error('This arrangement was saved by a newer version.');
 if(data.kit!==kit.id)throw new Error(`This arrangement is for the ${String(data.kit).replace(/^tr/,'')}, not the ${kit.name}.`);
 const empty=emptyPattern(kit),raw=data.bank;
 if(!raw||!Array.isArray(raw.patterns))throw new Error('The arrangement has no patterns.');
 const bank=normalizeBank({...raw,patterns:raw.patterns.map(p=>p===null?empty():p)},{count:64,empty,valid:validPattern(kit),migrate:foldAccent(kit)});
 if(!bank)throw new Error('Some of the arrangement\'s patterns are damaged, or do not fit this machine.');
 return {bank,name:String(data.name||bank.title||'Arrangement').slice(0,80),values:synth.params.sanitize(data.values&&typeof data.values==='object'?data.values:{}),rack:data.rack&&typeof data.rack==='object'?RACK_PARAMS.sanitize(data.rack):null};
}
