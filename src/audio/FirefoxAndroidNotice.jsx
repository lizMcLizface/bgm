import React, {useEffect, useRef, useState} from 'react';
import {shouldShowFirefoxAndroidNotice, dismissFirefoxAndroidNotice} from './firefoxAndroidCompatibility';
import './firefoxAndroidNotice.css';

export default function FirefoxAndroidNotice() {
    const [visible, setVisible] = useState(shouldShowFirefoxAndroidNotice);
    const [permanent, setPermanent] = useState(false);
    const dialog = useRef(null);
    useEffect(() => {
        const node = dialog.current;
        if (!visible || !node || node.open) return;
        if (node.showModal) node.showModal();
        else node.setAttribute('open', '');
        node.querySelector('button')?.focus({preventScroll: true});
    }, [visible]);
    const dismiss = () => {
        dismissFirefoxAndroidNotice(permanent);
        dialog.current?.close?.();
        setVisible(false);
    };
    if (!visible) return null;
    return <dialog className="audio-browser-notice" ref={dialog}
        aria-labelledby="audio-browser-notice-title" aria-describedby="audio-browser-notice-body"
        onCancel={event => { event.preventDefault(); dismiss(); }}>
        <h2 id="audio-browser-notice-title">Audio issues in Firefox on Android</h2>
        <p id="audio-browser-notice-body">Audio playback can crackle, drop out, lag, or stop in this browser. For better audio compatibility, try opening this page in Chrome.</p>
        <label><input type="checkbox" checked={permanent} onChange={event => setPermanent(event.target.checked)} /> Don’t show this again</label>
        <button type="button" autoFocus onClick={dismiss}>Continue anyway</button>
    </dialog>;
}
