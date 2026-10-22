// How long you have been listening (mm:ss, h:mm:ss past an hour): counts while anything plays,
// holds while paused, and starts again from 0 when the music starts again from the beginning.
import React, { useEffect, useRef, useState } from 'react';

const format = (ms) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

export default function ListeningTimer({ generator, running }) {
    const total = useRef(0), since = useRef(null);
    const [, tick] = useState(0);
    useEffect(() => {
        if (running) {
            // a fresh start (not a resume after pause) starts the count again
            if (!generator.paused && since.current === null && generator.currentBar <= 0) total.current = 0;
            since.current = performance.now();
            const timer = setInterval(() => tick((n) => n + 1), 1000);
            return () => {
                clearInterval(timer);
                total.current += performance.now() - since.current;
                since.current = null;
            };
        }
        return undefined;
    }, [running, generator]);
    const ms = total.current + (since.current !== null ? performance.now() - since.current : 0);
    if (!running && ms < 1000) return null;
    return <span className="gen-sleep gen-listening" role="timer" aria-label={`Listening for ${format(ms)}`} title="How long you have been listening">Listening {format(ms)}</span>;
}
