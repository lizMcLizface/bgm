// Header widget: how busy the audio thread is, dropouts where the browser
// reports them, and the output buffer size (src/audio/context.js).

import React, { useEffect, useState } from 'react';
import { audioContext, storedBufferSeconds, storeBufferSeconds } from '../audio/context';
import { masterBus } from '../audio/bus';
import { startLoadMeter } from '../audio/loadMeter';

const BUFFERS = [
    [0, 'Lowest latency'],
    [0.02, '20 ms'],
    [0.05, '50 ms'],
    [0.1, '100 ms'],
    [0.2, '200 ms'],
];

// Above this the thread is close to missing deadlines on a busy moment.
const HIGH_LOAD = 0.7;

const AudioStatus = ({ onReload }) => {
    const [status, setStatus] = useState({ load: null, dropouts: null });
    useEffect(() => startLoadMeter(audioContext, masterBus, setStatus), []);
    const { load, dropouts } = status;
    const percent = load === null ? null : Math.round(load * 100);
    const actualMs = Math.round((audioContext.baseLatency || 0) * 1000);
    const [, refresh] = useState(0);
    // onReload returns false when the reload was cancelled.
    const changeBuffer = (e) => {
        const previous = storedBufferSeconds();
        if (!storeBufferSeconds(Number(e.target.value))) return;
        if (!onReload()) {
            storeBufferSeconds(previous);
            refresh((n) => n + 1);
        }
    };
    return (
        <div className="gen-audio" title="Share of the audio thread's time spent rendering. Near 100% the sound drops out; a larger buffer rides out spikes, at the cost of keyboard/MIDI latency.">
            <span className="gen-audio-label">Audio</span>
            <span className={`gen-meter${load > HIGH_LOAD ? ' is-high' : ''}`} aria-hidden="true">
                <i style={{ width: `${Math.min(100, percent || 0)}%` }} />
            </span>
            <span className="gen-audio-value" role="status">
                {percent === null ? '–' : `${percent}%`}
                {dropouts ? ` · ${dropouts} dropout${dropouts > 1 ? 's' : ''}` : ''}
            </span>
            <label className="gen-audio-buffer">
                <span className="gen-visually-hidden">Audio buffer (reloads the page)</span>
                <select value={storedBufferSeconds() || 0} onChange={changeBuffer} title={`Output buffer, now ${actualMs} ms. Changing it reloads the page; settings are kept.`}>
                    {BUFFERS.map(([seconds, label]) => <option key={seconds} value={seconds}>{label}</option>)}
                </select>
            </label>
        </div>
    );
};

export default AudioStatus;
