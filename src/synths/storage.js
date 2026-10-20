// Per-device conveniences (current sound, saved sounds, setup). Storage can be
// unavailable (private windows, blocked site data); everything works without it.
export function load(key,fallback){
 try{const raw=window.localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw);}catch{return fallback;}
}
export function save(key,value){
 try{window.localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}
}
