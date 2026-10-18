import {patchColourTail} from './voiceColour';
import {qualityFixture} from './qualityFixtures';
import {cloneFM,FM_RECIPES} from './fmPatch';
import {clonePatch} from './patch';
import {defaultInserts,sanitizeInserts,insertsTail} from './insertsConfig';
export const TEXTURE_SOUNDS=[['fm-motion','FM · moving operators'],['fm-chorus','FM · stereo chorus'],['sub-chorus','Subtractive · stereo chorus'],['fm-phaser','FM organ · phaser'],['sub-flanger','Subtractive · flanger'],['sub-tone','Subtractive · EQ and saturation'],['fm-all','FM · expression + inserts'],['sub-all','Subtractive · expression + inserts']];
export function textureConfig(raw={}){return {sound:TEXTURE_SOUNDS.some(([id])=>id===raw.sound)?raw.sound:'fm-all',rate:[44100,48000,96000].includes(Number(raw.rate))?Number(raw.rate):48000};}
export function textureFixture(raw={}){
 const config=textureConfig(raw),fm=config.sound.startsWith('fm'),fixture=qualityFixture({sound:fm?'glass':'pwm',rate:config.rate});
 if(config.sound==='fm-phaser')fixture.patch=cloneFM(FM_RECIPES[5]);
 if(['fm-motion','fm-all'].includes(config.sound))fixture.patch=cloneFM(FM_RECIPES[8]);
 if(!fm){fixture.patch.global.chorus=0;if(config.sound==='sub-all')Object.assign(fixture.patch.layers[0],{wanderCents:3,wanderRate:.2,ampAttackCurve:1.5,modSource1:10,modTarget1:2,modDepth1:.15,modSource2:3,modTarget2:3,modDepth2:.2,modSource3:2,modTarget3:5,modDepth3:.15});}
 fixture.patch.inserts=defaultInserts();
 const effect=config.sound.endsWith('chorus')?{chorus:.65}:config.sound==='fm-phaser'?{phaser:.7,phaserRate:.25,phaserDepth:1.7,phaserFeedback:.3}:config.sound==='sub-flanger'?{flanger:.7,flangerRate:.2,flangerDepth:1.5,flangerDelay:2.5,flangerFeedback:.5}:config.sound==='sub-tone'?{saturation:.5,drive:12,lowGain:2,midGain:-3,midFreq:1000,highGain:-2,gain:-1}:config.sound.endsWith('all')?{chorus:.35,phaser:.25,phaserDepth:1,flanger:.15,flangerDepth:.7,saturation:.2,drive:9,lowGain:1.5,highGain:-1,gain:-1}:{};
 const inserts=sanitizeInserts(effect),release=fm?Math.max(...fixture.patch.operators.slice(0,fixture.patch.global.operators).map(o=>o.release)):fixture.patch.layers[0].release;
 return {...fixture,config,inserts,seconds:fixture.scoreSeconds+release+patchColourTail(fixture.patch)+.2+insertsTail(inserts)};
}
export function textureVariants(fixture){
 const copy=fixture.kind==='fm'?cloneFM:clonePatch,p=copy(fixture.patch),motion=fixture.config.sound==='fm-motion'||fixture.config.sound.endsWith('all');
 if(motion){const controls=fixture.kind==='fm'?[p.global]:p.layers;for(const c of controls){c.wanderCents=0;for(let slot=1;slot<=4;slot++)c['modDepth'+slot]=0;}
  if(fixture.kind==='fm')for(const op of p.operators)Object.assign(op,{attackCurve:1,decayCurve:1,releaseCurve:1});else for(const c of p.layers)Object.assign(c,{ampAttackCurve:1,ampDecayCurve:1,ampReleaseCurve:2});
 }
 const rows=[{id:'plain',name:motion?'Fixed texture':'Inserts off',patch:p,inserts:defaultInserts()}];
 if(motion)rows.push({id:'moving',name:'Expression · inserts off',patch:copy(fixture.patch),inserts:defaultInserts()});
 if(fixture.config.sound!=='fm-motion')rows.push({id:'inserts',name:motion?'Expression + instrument inserts':'Instrument inserts',patch:copy(fixture.patch),inserts:fixture.inserts});
 return rows;
}
