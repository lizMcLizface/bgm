const refused=message=>Object.assign(Error(message),{code:'GENERATOR_PREPARED_SOUND_SETTINGS_REFUSED'});
const normalize=issue=>issue instanceof Error?issue:Object.assign(Error('Prepared sound settings failed'),{cause:issue});
const has=(patch,key)=>key in patch;
/** Synchronous two-author transaction. Capacity for every owned wave is held
 * before the first DSP/settings publication. Legacy role-only dispatch stays exact. */
export function applyPreparedSoundSettings(g,patch,{roleAuthor=null,scalarAuthor=null,defaults,onError=()=>{}}={}){
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||typeof onError!=='function')throw refused('A settings patch and failure observer are required');
 const ownsMix=!!roleAuthor&&(has(patch,'volumes')||has(patch,'muted')),ownsAmbience=!!scalarAuthor&&has(patch,'ambienceVolume'),flags={ownsMix,ownsAmbience};
 const mix={...(has(patch,'volumes')?{volumes:patch.volumes}:{}),...(has(patch,'muted')?{muted:patch.muted}:{})};
 if(!ownsAmbience){if(ownsMix)roleAuthor.applySettingsMix(mix,defaults);return flags;}
 if(!ownsMix){scalarAuthor.applySettingsAmbienceVolume(patch.ambienceVolume);return flags;}
 if(!g?.settings||['reserveSettingsMix','checkSettingsMix','commitSettingsMix','cancelSettingsMix','settingsMixReservationState','quarantine'].some(key=>typeof roleAuthor[key]!=='function')||['reserveSettingsAmbienceVolume','checkSettingsAmbienceVolume','commitSettingsAmbienceVolume','cancelSettingsAmbienceVolume','settingsAmbienceVolumeReservationState','quarantine'].some(key=>typeof scalarAuthor[key]!=='function'))throw refused('Both prepared settings authors require explicit reservation authority');
 const keys=Object.keys(patch),values=keys.map(key=>patch[key]),ownedKeys=['volumes','muted','ambienceVolume'].filter(key=>has(patch,key)),ownedValues=ownedKeys.map(key=>patch[key]),ambience=patch.ambienceVolume,held=[];
 const unchanged=()=>{const now=Object.keys(patch);if(now.length!==keys.length||now.some((key,i)=>key!==keys[i]||!Object.is(patch[key],values[i]))||ownedKeys.some((key,i)=>!has(patch,key)||!Object.is(patch[key],ownedValues[i])))throw refused('Settings patch changed while capacity was reserved');};
 const cancelAll=()=>{const errors=[];for(const entry of held.slice().reverse()){let state='unknown';try{state=entry.state(entry.token);}catch(issue){errors.push(normalize(issue));}if(state!=='retired')try{entry.cancel(entry.token);}catch(issue){errors.push(normalize(issue));}}return errors;};
 const quarantine=primary=>{for(const author of[scalarAuthor,roleAuthor])try{author.quarantine(primary);}catch(issue){(primary.quarantineErrors??=[]).push(normalize(issue));}try{onError(primary);}catch(issue){primary.callbackError??=normalize(issue);}};
 let publicationStarted=false;
 try{
  const roleToken=roleAuthor.reserveSettingsMix(mix,defaults);held.push({token:roleToken,state:roleAuthor.settingsMixReservationState,cancel:roleAuthor.cancelSettingsMix});
  const scalarToken=scalarAuthor.reserveSettingsAmbienceVolume(ambience);held.push({token:scalarToken,state:scalarAuthor.settingsAmbienceVolumeReservationState,cancel:scalarAuthor.cancelSettingsAmbienceVolume});
  unchanged();roleAuthor.checkSettingsMix(roleToken);scalarAuthor.checkSettingsAmbienceVolume(scalarToken);
  publicationStarted=true;
  scalarAuthor.commitSettingsAmbienceVolume(scalarToken);
  roleAuthor.commitSettingsMix(roleToken);
  return flags;
 }catch(issue){const primary=normalize(issue),cleanup=cancelAll();if(cleanup.length)primary.cleanupError=new AggregateError([...(primary.cleanupError?[primary.cleanupError]:[]),...cleanup],'Prepared sound settings reservation cleanup failed');if(publicationStarted||cleanup.length||primary.cleanupError)quarantine(primary);throw primary;}
}
