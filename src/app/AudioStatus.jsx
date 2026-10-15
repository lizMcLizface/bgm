// Header audio controls: master volume, how busy the audio thread is (with
// dropouts where the browser reports them), and the settings menu - output
// buffer size (src/audio/context.js), quick stop, colour theme.

import React, { useEffect, useRef, useState } from 'react';
import { audioContext, storedBufferSeconds, storeBufferSeconds } from '../audio/context';
import { masterBus } from '../audio/bus';
import { startLoadMeter } from '../audio/loadMeter';
import { readPref, writePref } from './prefs';
import { THEMES, applyTheme, storedTheme } from './theme';

const VOLUME_KEY = 'bgm-volume';
const QUICK_STOP_KEY = 'bgm-quick-stop';

const BUFFERS = [
    [0, 'Lowest latency'],
    [0.02, '20 ms'],
    [0.05, '50 ms'],
    [0.1, '100 ms'],
    [0.2, '200 ms'],
];

// Above this the thread is close to missing deadlines on a busy moment.
const HIGH_LOAD = 0.7;

/** Master volume (masterBus), remembered per browser. */
export const MasterVolume = () => {
    const [volume, setVolume] = useState(() => readPref(VOLUME_KEY, 1));
    useEffect(() => {
        masterBus.gain.setTargetAtTime(volume, audioContext.currentTime, 0.02);
        writePref(VOLUME_KEY, volume);
    }, [volume]);
    return (
        <label className="gen-volume" title="Master volume">
            <span className="gen-audio-label">Vol</span>
            <input type="range" min="0" max="1" step="0.01" value={volume} aria-label="Master volume"
                onChange={(e) => setVolume(Number(e.target.value))} />
        </label>
    );
};

/** Audio-thread load, and dropouts where reported. */
export const AudioMeter = () => {
    const [status, setStatus] = useState({ load: null, dropouts: null });
    useEffect(() => startLoadMeter(audioContext, masterBus, setStatus), []);
    const { load, dropouts } = status;
    const percent = load === null ? null : Math.round(load * 100);
    return (
        <div className="gen-audio" title="Share of the audio thread's time spent rendering. Near 100% the sound drops out; a larger buffer (⚙) rides out spikes.">
            <span className="gen-audio-label">CPU</span>
            <span className={`gen-meter${load > HIGH_LOAD ? ' is-high' : ''}`} aria-hidden="true">
                <i style={{ width: `${Math.min(100, percent || 0)}%` }} />
            </span>
            <span className="gen-audio-value" role="status">
                {percent === null ? '–' : `${percent}%`}
                {dropouts ? ` · ${dropouts} dropout${dropouts > 1 ? 's' : ''}` : ''}
            </span>
        </div>
    );
};

const THEME_LABELS = { auto: 'Follow system', light: 'Light', dark: 'Dark' };

/**
 * The ⚙ menu. onReload returns false when a buffer change's reload was
 * cancelled.
 */
export const SettingsMenu = ({ generator, onReload }) => {
    const [, refresh] = useState(0);
    const [quickStop, setQuickStop] = useState(() => readPref(QUICK_STOP_KEY, true));
    const [theme, setTheme] = useState(storedTheme);
    const menu = useRef(null);
    // closes on a click elsewhere or Escape, like a menu
    useEffect(() => {
        const close = (e) => {
            if (!menu.current || !menu.current.open) return;
            if (e.type === 'keydown' ? e.key === 'Escape' : !menu.current.contains(e.target)) menu.current.open = false;
        };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', close);
        };
    }, []);
    useEffect(() => {
        generator.quickStop = quickStop;
        writePref(QUICK_STOP_KEY, quickStop);
    }, [generator, quickStop]);
    const changeBuffer = (e) => {
        const previous = storedBufferSeconds();
        if (!storeBufferSeconds(Number(e.target.value))) return;
        if (!onReload()) {
            storeBufferSeconds(previous);
            refresh((n) => n + 1);
        }
    };
    const changeTheme = (e) => {
        applyTheme(e.target.value);
        setTheme(e.target.value);
    };
    const actualMs = Math.round((audioContext.baseLatency || 0) * 1000);
    return (
        <details className="gen-settings" ref={menu}>
            <summary title="Audio and display settings" aria-label="Settings">⚙</summary>
            <div className="gen-settings-menu">
                <label className="gen-field">
                    <span>Audio buffer (now {actualMs} ms)</span>
                    <select value={storedBufferSeconds() || 0} onChange={changeBuffer}>
                        {BUFFERS.map(([seconds, label]) => <option key={seconds} value={seconds}>{label}</option>)}
                    </select>
                    <small>Larger stops crackling on slow machines, but delays keyboard / MIDI. Reloads the page; settings are kept.</small>
                </label>
                <label className="gen-check">
                    <input type="checkbox" checked={quickStop} onChange={(e) => setQuickStop(e.target.checked)} />
                    Quick fade on Stop (cut reverb and echo tails)
                </label>
                <label className="gen-field">
                    <span>Theme</span>
                    <select value={theme} onChange={changeTheme}>
                        {THEMES.map((id) => <option key={id} value={id}>{THEME_LABELS[id]}</option>)}
                    </select>
                </label>
            </div>
        </details>
    );
};
