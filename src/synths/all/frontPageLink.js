import {presetFromSearch,sceneBySlug,parseSetup} from '../../app/scenes';
import {shareFromLocation} from '../../app/settings';

const SHARE_KEYS=['m','v','a','x','s'];

/** Read the front page's preset and share-link formats without changing the address. */
export function frontPageLink(location) {
 const query=new URLSearchParams(location.search||'');
 const hasSettings=SHARE_KEYS.some(key=>query.has(key))||(location.hash||'').includes('s=');
 const name=presetFromSearch(location.search);
 const scene=hasSettings?null:sceneBySlug(name);
 const share=shareFromLocation(location);
 if(hasSettings&&!share)throw new Error('That share link could not be read.');
 if(name&&!scene&&!hasSettings)throw new Error(`Unknown preset: ${name}`);
 if(!scene&&!share)return null;
 return {scene,share,search:location.search||''};
}

export function parseFrontPageInput(text) {
 const input=text.trim();
 if(!input)throw new Error('Enter a front-page URL or preset name.');
 if(input.startsWith('{'))return {scene:parseSetup(input),share:null,search:'',custom:true};
 const named=sceneBySlug(input);
 if(named)return {scene:named,share:null,search:''};
 let url;
 try{url=new URL(input,window.location.origin);}
 catch{throw new Error('Enter a valid front-page URL or preset name.');}
 const result=frontPageLink(url);
 if(!result)throw new Error('No preset or settings found in that link.');
 return result;
}
