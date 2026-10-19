let audio, creates, media, originalUrl;
beforeEach(()=>{
 vi.resetModules();creates=0;originalUrl=URL.createObjectURL;URL.createObjectURL=vi.fn(()=> 'blob:silent-test');
 media={setActionHandler:vi.fn()};vi.stubGlobal('navigator',{mediaSession:media});
 vi.stubGlobal('Audio',class{constructor(){creates++;audio=this;this.paused=true;this.currentTime=0;this.duration=10;this.readyState=4;this.play=vi.fn(()=>{this.paused=false;return Promise.resolve();});this.pause=vi.fn(()=>{this.paused=true;});}});
 history.replaceState(null,'','/');
});
afterEach(()=>{URL.createObjectURL=originalUrl;history.replaceState(null,'','/');vi.unstubAllGlobals();});
it('default playback retains the helper but does not repeat play while it is already playing',async()=>{
 const m=await import('./mediaSession');m.updateMediaSession({playing:true});m.updateMediaSession({playing:true});expect(creates).toBe(1);expect(audio.play).toHaveBeenCalledOnce();m.updateMediaSession({playing:false});expect(audio.pause).toHaveBeenCalledOnce();expect(m.mediaSessionDiagnostics().helperEnabled).toBe(true);
});
it('a helper-off link keeps metadata and media actions without a second audio stream',async()=>{
 history.replaceState(null,'','/?mediaHelper=0');const m=await import('./mediaSession');const play=vi.fn();m.setupMediaSession({play});m.updateMediaSession({playing:true,title:'test'});expect(creates).toBe(0);expect(media.playbackState).toBe('playing');expect(media.setActionHandler).toHaveBeenCalledWith('play',play);expect(m.mediaSessionDiagnostics()).toMatchObject({helperEnabled:false,helper:null});
});
it('the isolated output comparison can pause the helper without altering a saved setting',async()=>{
 const m=await import('./mediaSession');m.updateMediaSession({playing:true,helper:true});m.updateMediaSession({playing:true,helper:false});expect(audio.pause).toHaveBeenCalledOnce();expect(media.playbackState).toBe('playing');expect(m.mediaSessionDiagnostics().helperEnabled).toBe(false);expect(localStorage.getItem('mediaHelper')).toBeNull();
});
it('reports helper playback rejection without hiding the rest of the playback state',async()=>{
 const m=await import('./mediaSession');m.updateMediaSession({playing:true});audio.paused=true;audio.play.mockRejectedValueOnce(new DOMException('denied','NotAllowedError'));m.updateMediaSession({playing:true});await Promise.resolve();expect(m.mediaSessionDiagnostics().playError.name).toBe('NotAllowedError');
});

it('restricted artwork conversion does not leave metadata pending or throw from image.onload',async()=>{
 vi.stubGlobal('Image',class{set src(_value){queueMicrotask(()=>this.onload());}});
 vi.stubGlobal('MediaMetadata',class{constructor(data){Object.assign(this,data);}});
 const create=document.createElement.bind(document),spy=vi.spyOn(document,'createElement').mockImplementation(name=>name==='canvas'?{getContext:()=>({drawImage(){}}),toDataURL(){throw new DOMException('blocked','SecurityError');}}:create(name));
 try{const m=await import('./mediaSession');m.updateMediaSession({playing:true,helper:false,title:'test'});await Promise.resolve();await Promise.resolve();expect(media.metadata.artwork).toEqual([]);expect(media.metadata.title).toBe('test');}finally{spy.mockRestore();}
});
