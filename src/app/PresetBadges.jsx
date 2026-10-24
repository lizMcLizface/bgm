import React from 'react';
export default function PresetBadges({isNew=false,isUpdated=false,wasm=false}){
 if(!isNew&&!isUpdated&&!wasm)return null;
 return <span className="gen-preset-badges">{isNew&&<span className="gen-new-badge">New</span>}{isUpdated&&!isNew&&<span className="gen-new-badge">Updated</span>}{wasm&&<span>Wasm only</span>}</span>;
}
