import React from 'react';
export default function PresetBadges({isNew=false,wasm=false}){
 if(!isNew&&!wasm)return null;
 return <span className="gen-preset-badges">{isNew&&<span className="gen-new-badge">New</span>}{wasm&&<span>Wasm only</span>}</span>;
}
