// Factory banks on this machine: the local dev/preview servers (and local builds of dist/)
// serve the git-ignored banks/<synth>/ folders at local-banks/ with an index.json; see
// vite.config.js. On the public site there is no index, and every page behaves as before.
let index=null;
const base=import.meta.env.BASE_URL;

/** {synth: [{name, url}]} or {} when there are no local banks. */
export function localBankIndex(){
 return index??=fetch(`${base}local-banks/index.json`)
  .then(r=>r.ok&&/json/.test(r.headers.get('content-type')??'')?r.json():{})
  .catch(()=>({}));
}

/** The local banks for one synth folder (e.g. 'juno-106'), possibly empty. */
export async function localBanks(synth){
 return (await localBankIndex())[synth]??[];
}

/** Bytes of one local bank entry. */
export async function fetchLocalBank(entry){
 const r=await fetch(base+entry.url);
 if(!r.ok)throw Error(`HTTP ${r.status}`);
 return new Uint8Array(await r.arrayBuffer());
}

/** The bank to load first: a name with "factory" in it, else the first. */
export const preferredBank=list=>list.find(b=>/factory/i.test(b.name))??list[0]??null;
