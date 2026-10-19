// Audio-thread load and dropouts for the page header (the estimate itself:
// public/load-meter-processor.js). Dropouts come from the browser where it
// reports them (Chrome's AudioContext.playbackStats / playoutStats).

// Snapshot these while output windows arrive: some platform stats cover only
// a recent interval and can change when the page returns from the lock screen.
export function readOutputPlatform(context) {
    const result = {};
    try { result.timestamp = context.getOutputTimestamp?.(); } catch { /* unsupported */ }
    for (const key of ['playoutStats', 'playbackStats']) {
        try { if (context[key]?.toJSON) result[key] = context[key].toJSON(); } catch { /* unsupported */ }
    }
    return result;
}

/**
 * @param {AudioContext} AC
 * @param {AudioNode} source - the node everything sums into (masterBus)
 * @param {function} onUpdate - ({ load: number|null, dropouts: number|null }) about once a second
 * @param {function} [onSilence] - (seconds) when a stretch of silence (over 0.1 s) in the output ends
 * @returns {function} stop
 */
export function startLoadMeter(AC, source, onUpdate, onSilence = () => {}, onIdle = () => {}) {
    let node = null;
    let stopped = false;
    const history = [];
    const events = [];
    const record=event=>{events.push(event);if(events.length>32)events.shift();};
    const updateState=()=>{record({type:'context-state',wallTime:Date.now(),audioTime:AC.currentTime,state:AC.state});onUpdate({load:null,dropouts:dropouts(),state:AC.state,output:null,outputHistory:history.slice(),outputEvents:events.slice()});node?.port.postMessage({type:'reset'});};
    const dropouts = () => {
        try {
            const stats = AC.playoutStats || AC.playbackStats;
            if (!stats) return null;
            const events = stats.fallbackFramesEvents ?? stats.underrunEvents;
            return typeof events === 'number' ? events : null;
        } catch { return null; }
    };
    if (!AC.audioWorklet) return () => {};
    const visibilityChanged=()=>record({type:'visibility',wallTime:Date.now(),audioTime:AC.currentTime,state:document.visibilityState,platform:readOutputPlatform(AC)});
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',visibilityChanged);
    AC.addEventListener?.('statechange',updateState);
    AC.audioWorklet.addModule(`${import.meta.env.BASE_URL}load-meter-processor.js?v=output-4`).then(() => {
        if (stopped) return;
        node = new AudioWorkletNode(AC, 'load-meter', { numberOfInputs: 1, numberOfOutputs: 0, processorOptions: { gapThresholdMs: Math.max(250, (AC.baseLatency || 0) * 2000) } });
        source.connect(node);
        updateState();
        node.port.onmessage = ({ data }) => {
            if(stopped)return;
            if(data.callbackGap){record({type:'callback-gap',...data.callbackGap});return;}
            if (data.silence !== undefined) onSilence(data.silence);
            else {
                const output=data.output?{...data.output,observedAtWallTime:Date.now(),observedAtAudioTime:AC.currentTime,platform:readOutputPlatform(AC)}:null;
                if(output){history.push(output);if(history.length>32)history.shift();}
                onUpdate({ load: data.load, loadReason:data.loadReason, dropouts: dropouts(),state:AC.state,output,outputHistory:history.slice(),outputEvents:events.slice() });if(data.idle)onIdle();
            }
        };
    }, (error) => console.warn('Audio load meter unavailable:', error));
    return () => {
        stopped = true;
        AC.removeEventListener?.('statechange',updateState);
        if(typeof document!=='undefined')document.removeEventListener('visibilitychange',visibilityChanged);
        if (node) {
            node.port.postMessage({type:'dispose'});
            source.disconnect(node);
            node.port.onmessage = null;
        }
    };
}
