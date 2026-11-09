// User-authored observations, not inferred from telemetry or retrospectively
// attached to a particular build/run. Preserve the original wording.
export const TARGET_LISTENING_FEEDBACK=Object.freeze({
  version:1,source:'User messages; target-device listening, no correlated run export',date:'2026-11-09',
  quote:'the +2 blocks helps with 96k on short when the app is open, on lock screen its not enough but on 48khz with 3 workers the buffer and messaging it works fine on lock',
  clarification:'default and 2048m, message tasks, +2 blocks, played on three workers',
  clarificationInterpretation:'Default and the 2048-frame Medium selector; these labels describe original capacity before extra slots.',
  observations:[
    {rate:96000,profile:'short',extraBlocks:2,scheduling:null,workers:null,playbackState:'foreground',result:'helps; not a claim of fully clean audio',bufferingFrames:1536,bufferingMs:16},
    {rate:96000,profile:'short',extraBlocks:2,scheduling:null,workers:null,playbackState:'locked',result:'not enough',bufferingFrames:1536,bufferingMs:16},
    {rate:48000,profile:'default',extraBlocks:2,scheduling:'message',workers:3,playbackState:'locked',result:'works fine',bufferingFrames:6144,bufferingMs:128},
    {rate:48000,profile:'medium',extraBlocks:2,scheduling:'message',workers:3,playbackState:'locked',result:'works fine',bufferingFrames:3072,bufferingMs:64}
  ],deviceModel:null,browser:null,outputRoute:null,graphVersion:null,runId:null,cause:null
});
export function targetListeningNote(profile,rate,extraBlocks,scheduling){
  if(profile==='short'&&rate===96000&&extraBlocks===2)return 'User report: Short / 96 kHz / +2 helps while the app is open, but is insufficient on the lock screen. The 96 kHz scheduling mode was not specified; no matching run export is available.';
  if(rate===48000&&['default','medium'].includes(profile)&&extraBlocks===2&&scheduling==='message')return `User-reported lock-screen playback worked with three workers at these settings (${profile==='default'?128:64} ms declared buffering). Device/output route and a matching run export were not supplied.`;
  return '';
}
