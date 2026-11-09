// HTML/public audio URLs keep the configured site base. Build assets requested
// by JS (including Vite's blocking lazy CSS preload) follow their importing
// module, so forwarded preview asset paths do not escape to the document root.
export function moduleAssetUrl(filename,{hostType,type}){
 if(hostType==='js'&&type==='asset'&&filename.startsWith('assets/'))return {relative:true};
}
