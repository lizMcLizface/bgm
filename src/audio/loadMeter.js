// Audio-thread load and dropouts for the page header (the estimate itself:
// public/load-meter-processor.js). Dropouts come from the browser where it
// reports them (Chrome's AudioContext.playbackStats / playoutStats).

/**
 * @param {AudioContext} AC
 * @param {AudioNode} source - the node everything sums into (masterBus)
 * @param {function} onUpdate - ({ load: number|null, dropouts: number|null }) about once a second
 * @returns {function} stop
 */
export function startLoadMeter(AC, source, onUpdate) {
    let node = null;
    let stopped = false;
    const dropouts = () => {
        const stats = AC.playoutStats || AC.playbackStats;
        if (!stats) return null;
        const events = stats.fallbackFramesEvents ?? stats.underrunEvents;
        return typeof events === 'number' ? events : null;
    };
    if (!AC.audioWorklet) return () => {};
    AC.audioWorklet.addModule(`${import.meta.env.BASE_URL}load-meter-processor.js`).then(() => {
        if (stopped) return;
        node = new AudioWorkletNode(AC, 'load-meter', { numberOfInputs: 1, numberOfOutputs: 0 });
        source.connect(node);
        node.port.onmessage = ({ data }) => onUpdate({ load: data.load, dropouts: dropouts() });
    }, (error) => console.warn('Audio load meter unavailable:', error));
    return () => {
        stopped = true;
        if (node) {
            source.disconnect(node);
            node.port.onmessage = null;
        }
    };
}
