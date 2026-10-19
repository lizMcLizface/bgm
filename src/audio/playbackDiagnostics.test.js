import {playbackDiagnostics,formatPlaybackSummary} from './playbackDiagnostics';
it('includes bounded scheduler history and distinguishes source failures from loading',()=>{
 const g={AC:{currentTime:4,state:'running',audioWorklet:{},sampleRate:48000},transport:{diagnostics:{recoveries:1,recent:[{type:'rebase',lateSeconds:2}]}},roles:{lead:{instrument:{loading:false,error:Error('processor failed'),voice:{spec:{kind:'fm'},stats:{frame:192000}}}}}};
 const d=playbackDiagnostics(g);expect(d.transport.recoveries).toBe(1);expect(d.audioWorkletAvailable).toBe(true);expect(d.roles.lead).toMatchObject({loading:false,kind:'fm',error:'processor failed'});
});

it('puts percussion and transport counters before bounded optional history',()=>{
 const d={seed:42,percussionEngine:'wasm',engine:'wasm',context:{state:'running',time:105,playbackStats:{underrunEvents:1,underrunDuration:.1014,totalDuration:11.925}},
  transport:{recoveries:0,maxTickGap:.1,recent:[]},roles:{perc:{kind:'percussion',stats:{queued:59,active:2,late:0,dropped:0,resyncs:0,skippedFrames:0,frame:5040000}},pad:{stats:{active:3,late:1}}},
  meter:{load:.356456,history:Array.from({length:32},(_,i)=>({audioTime:i,wallTime:i*1000,rms:.02,maxCallbackGapMs:75,nonFinite:0,platform:{playbackStats:{underrunEvents:1,totalDuration:7.3662}}}))}};
 const text=formatPlaybackSummary(d);
 expect(text).toContain('"queued":59');expect(text).toContain('"late":0');expect(text).toContain('"recoveries":0');expect(text).toContain('"underrunDuration":0.1014');
 expect(text.indexOf('sources:')).toBeLessThan(text.indexOf('output:'));
 expect(text).toContain('"platformDurationRange":[7.3662,7.3662]');expect(text).toContain('may freeze while hidden');expect(text.length).toBeLessThan(6000);
});
it('summarizes a completed locked interval using both clocks without counting startup logs as locked gaps',()=>{
 const d={context:{},roles:{},meter:{events:[{type:'visibility',state:'hidden',wallTime:1000,audioTime:1},{type:'visibility',state:'visible',wallTime:171000,audioTime:170.9}]}};
 const text=formatPlaybackSummary(d,[{at:'old',sincePlaySeconds:0,visibility:'visible',silentSeconds:.1}]);
 expect(text).toContain('"wallSeconds":170');expect(text).toContain('"audioSeconds":169.9');expect(text).toContain('"rate":0.9994');expect(text).toContain('"sincePlaySeconds":0');
});
it('keeps a dense realistic report under the chat budget while preserving all five source counters',()=>{
 const stats={active:32,queued:8192,peakActive:64,steals:999,dropped:4,late:7,resyncs:2,skippedFrames:4096,frame:5040000,reportedAt:105.333333,peak:.982384,memory:2621440};
 const d={url:'https://example.test/?m='+'a'.repeat(50000),browser:'b'.repeat(10000),context:{state:'running',sampleRate:48000,time:105.354666666,baseLatency:.10133333},
  transport:{recoveries:3,recent:Array.from({length:32},()=>({type:'budget',ms:100,ahead:19,target:20}))},
  roles:Object.fromEntries(['perc','pad','bass','lead','counter'].map(name=>[name,{preset:'p'.repeat(1000),kind:'fm',error:'e'.repeat(1000),stats,inserts:{stats,error:'e'.repeat(1000)}}])),
  meter:{history:Array.from({length:32},(_,i)=>({audioTime:i,peak:.2,rms:.03})),events:Array.from({length:32},(_,i)=>({type:'visibility',state:i%2?'visible':'hidden',audioTime:i,wallTime:i*1000}))},
  roomDetails:Array.from({length:32},()=>({clients:4,ready:true,settings:{decay:20,quality:1},stats:{sleeping:false,peak:.2},error:'e'.repeat(1000)}))};
 const original=JSON.stringify(d),text=formatPlaybackSummary(d,Array.from({length:60},()=>({at:'old',sincePlaySeconds:0})));
 expect(text.length).toBeLessThan(6000);for(const role of['perc','pad','bass','lead','counter'])expect(text).toContain('"'+role+'":');
 expect(text).toContain('"queued":8192');expect(text).toContain('"recoveries":3');expect(JSON.stringify(d)).toBe(original);
});
it('distinguishes unavailable platform/voice statistics from reported zero and includes native drum sources',()=>{
 const g={AC:{state:'running',currentTime:4},transport:{},roles:{perc:{instrument:{sources:new Set([1,2]),effectsAwake:()=>true,soundUntil:20}}}};
 const d=playbackDiagnostics(g),text=formatPlaybackSummary(d);
 expect(d.roles.perc.native.sources).toBe(2);expect(text).toContain('"stats":null');expect(text).toContain('"maxReportedEvents":null');expect(text).toContain('"sources":2');
});
it('copies current recovery counters and context state even when no silence was logged',()=>{const g={AC:{currentTime:10,state:'running',sampleRate:48000},transport:{lookahead:20,slowestGap:1.5},isRunning:true,ambienceRunning:false,audioEngine:'wasm',roles:{lead:{presetName:'Test',instrument:{voice:{stats:{resyncs:2,skippedFrames:1024,frame:479000}}}}}};const d=playbackDiagnostics(g,{load:null,loadReason:'unavailable-pacing'});expect(d.roles.lead.stats.skippedFrames).toBe(1024);expect(d.meter.reason).toBe('unavailable-pacing');expect(d.context.state).toBe('running');expect(()=>JSON.stringify(d)).not.toThrow();});

it('captures downstream levels, rooms, inserts and output timestamps without changing the graph',()=>{
 const g={AC:{currentTime:10,state:'running',getOutputTimestamp:()=>({contextTime:9.9,performanceTime:5000}),playoutStats:{toJSON:()=>({fallbackFramesDuration:.2})}},output:{gain:{value:.5}},transport:{},wasmRoomPool:{rooms:new Map([[1,{}]]),diagnostics:[{clients:3,stats:{peak:.2}}]},roles:{pad:{instrument:{voice:{spec:{kind:'fm'},insert:{stats:{peak:.3}},room:{stats:{peak:.1}}}}}}};
 const d=playbackDiagnostics(g,{masterGain:.8,output:{peak:.4,rms:.1},outputHistory:[{peak:.4}]});
 expect(d.version).toBe(3);expect(d.gain).toEqual({master:.8,generator:.5});expect(d.meter.output.peak).toBe(.4);expect(d.roomDetails[0].stats.peak).toBe(.2);expect(d.roles.pad.inserts.stats.peak).toBe(.3);expect(d.context.timestamp.contextTime).toBe(9.9);expect(d.context.playoutStats.fallbackFramesDuration).toBe(.2);
});
