// Per-device conveniences (current sound, saved sounds, setup). Storage can be
// unavailable (private windows, blocked site data); everything works without it.
import {comparisonScope,scopedStorageKey} from './all/comparisonSession';
export function load(key,fallback){
 try{const id=comparisonScope(),shadow=id?window.sessionStorage.getItem(scopedStorageKey(id,key)):null;const raw=shadow??window.localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw);}catch{return fallback;}
}
export function save(key,value){
 try{const id=comparisonScope();if(id)window.sessionStorage.setItem(scopedStorageKey(id,key),JSON.stringify(value));else window.localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}
}
