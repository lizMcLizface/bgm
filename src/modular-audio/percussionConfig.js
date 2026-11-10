// Complete immutable basic-kit snapshots only. No implicit preset substitution,
// room/FX, legacy singleton edits or interpretation of classic machine values.
export function validatePercussionConfig(c,definition){
 if(c===undefined)return undefined;
 const keys=(v,names)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
 if(!definition||!keys(c,['version','voice','drums'])||c.version!==definition.version||!definition.voices.includes(c.voice)||!Array.isArray(c.drums)||c.drums.length!==definition.slots)throw Error('Invalid percussion kit configuration');
 for(const d of c.drums){
  if(!keys(d,['on','level','tone','decay'])||typeof d.on!=='boolean')throw Error('Invalid percussion drum configuration');
  for(const [key,bounds]of Object.entries(definition.fields))if(typeof d[key]!=='number'||!Number.isFinite(d[key])||d[key]<bounds.min||d[key]>bounds.max)throw Error(`Invalid percussion ${key}`);
 }
 return c;
}
