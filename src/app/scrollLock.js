import { useEffect } from 'react';

// While a window is open over the page (the preset browser, the voice
// picker) the page behind it does not scroll. Counted, so two windows lock
// and unlock it once; the page's scrollbar width is kept as padding so
// nothing shifts sideways.
let locks = 0;
let saved = null;

export function useScrollLock() {
    useEffect(() => {
        const body = document.body;
        if (locks === 0) {
            saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
            const bar = window.innerWidth - document.documentElement.clientWidth;
            if (bar > 0) body.style.paddingRight = `${bar}px`;
            body.style.overflow = 'hidden';
        }
        locks++;
        return () => {
            locks--;
            if (locks === 0 && saved) {
                body.style.overflow = saved.overflow;
                body.style.paddingRight = saved.paddingRight;
                saved = null;
            }
        };
    }, []);
}

/** For windows that are only mounted while open: render it inside to lock the page. */
export function ScrollLock() {
    useScrollLock();
    return null;
}
