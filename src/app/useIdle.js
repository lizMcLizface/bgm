// True after `ms` without the pointer moving, a tap, a key or a scroll on the page; any of them
// wakes it again (and starts the count over). Off while `enabled` is false.
import { useEffect, useState } from 'react';

const WAKERS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];

export function useIdle(ms, enabled = true) {
    const [idle, setIdle] = useState(false);
    useEffect(() => {
        if (!enabled) { setIdle(false); return undefined; }
        let timer = null, last = null;
        const sleep = () => setIdle(true);
        const wake = (e) => {
            // a pointer that only reports the place it already was has not moved
            if (e.type === 'pointermove') {
                if (last && last.x === e.clientX && last.y === e.clientY) return;
                last = { x: e.clientX, y: e.clientY };
            }
            setIdle(false);
            clearTimeout(timer);
            timer = setTimeout(sleep, ms);
        };
        timer = setTimeout(sleep, ms);
        WAKERS.forEach((type) => window.addEventListener(type, wake, { passive: true, capture: true }));
        return () => {
            clearTimeout(timer);
            WAKERS.forEach((type) => window.removeEventListener(type, wake, { capture: true }));
        };
    }, [ms, enabled]);
    return idle;
}
