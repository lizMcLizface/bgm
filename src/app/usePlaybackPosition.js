import { useEffect, useState } from 'react';

/**
 * The generator's audible position in beats, for the display components: read each frame while it runs,
 * re-rendering only when it crosses a step of 1/`perBeat` of a beat, and whenever the plan changes.
 * Returns { pos, version }.
 */
export default function usePlaybackPosition(generator, running, perBeat = 1) {
    const [version, setVersion] = useState(0);
    const [pos, setPos] = useState(0);
    useEffect(() => generator?.onPlanChange?.(() => setVersion((v) => v + 1)), [generator]);
    useEffect(() => {
        if (!generator) return undefined;
        let frame = 0;
        const tick = () => {
            let next = 0;
            try { next = generator.position(); } catch { /* mid-change */ }
            setPos((prev) => (Math.floor(prev * perBeat) === Math.floor(next * perBeat) ? prev : next));
            if (running) frame = requestAnimationFrame(tick);
        };
        tick();
        return () => cancelAnimationFrame(frame);
    }, [generator, running, perBeat]);
    return { pos, version };
}
