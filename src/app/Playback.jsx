// Next to Play: a sleep timer (fades out and stops after a while) and
// "Save audio" (renders the piece to a WAV file - engine/render.js).

import React, { useEffect, useRef, useState } from 'react';
import { readPref, writePref } from './prefs';
import { renderWav, wavBytes } from './engine/render';
import { useDismiss } from './AudioStatus';

const SLEEP_KEY = 'bgm-sleep-minutes';
const SLEEP_MINUTES = [0, 10, 15, 20, 30, 45, 60, 90, 120];
// The fade takes the timer's last minute (less on short timers).
const SLEEP_FADE = 60;

const clock = (seconds) => {
    const s = Math.max(0, Math.ceil(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

/**
 * Stops the music `minutes` after Play (or after choosing a time while
 * playing), fading out over the last minute. Remembered per browser.
 */
export const SleepTimer = ({ generator, running }) => {
    const [minutes, setMinutes] = useState(() => readPref(SLEEP_KEY, 0));
    const [endsAt, setEndsAt] = useState(null);
    const [now, setNow] = useState(Date.now());
    useEffect(() => writePref(SLEEP_KEY, minutes), [minutes]);
    useEffect(() => {
        setEndsAt(running && minutes ? Date.now() + minutes * 60000 : null);
    }, [running, minutes]);
    useEffect(() => {
        if (!endsAt) return undefined;
        const check = () => {
            const left = (endsAt - Date.now()) / 1000;
            if (left <= Math.min(SLEEP_FADE, minutes * 15) && !generator.fadingOut) generator.fadeOut(Math.max(1, left));
            setNow(Date.now());
        };
        check();
        const id = setInterval(check, 1000);
        return () => {
            clearInterval(id);
            // a new time (or Off) while fading: back to full level
            generator.cancelFadeOut();
        };
    }, [endsAt, generator, minutes]);
    return (
        <label className="gen-sleep" title="Fade out and stop after a while">
            <span className="gen-audio-label">Sleep</span>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Sleep timer">
                {SLEEP_MINUTES.map((m) => <option key={m} value={m}>{m ? `${m} min` : 'Off'}</option>)}
            </select>
            {endsAt && <span className="gen-sleep-left" role="timer">{clock((endsAt - now) / 1000)} left</span>}
        </label>
    );
};

const RECORD_KEY = 'bgm-record-minutes';
const RECORD_MINUTES = [1, 2, 5, 10, 15, 30, 60];

function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * "Save audio" menu: a length, then a WAV of the piece from its start -
 * the current settings, sounds, mix and ambience.
 * @param {function} fileName - (minutes) => file name
 */
export const Recorder = ({ generator, fileName }) => {
    const [minutes, setMinutes] = useState(() => readPref(RECORD_KEY, 5));
    const [progress, setProgress] = useState(null);
    const [message, setMessage] = useState('');
    const [started, setStarted] = useState(0);
    const abort = useRef(null);
    const menu = useRef(null);
    useDismiss(menu);
    useEffect(() => writePref(RECORD_KEY, minutes), [minutes]);
    const megabytes = Math.round(wavBytes(minutes * 60, generator.AC.sampleRate) / 1e6);
    // time left, from the pace so far (once there is a pace to go by)
    const elapsed = (Date.now() - started) / 1000;
    const left = progress > 0.03 ? elapsed * (1 - progress) / progress : null;
    const render = async () => {
        const controller = new AbortController();
        abort.current = controller;
        setMessage('');
        setProgress(0);
        const begin = Date.now();
        setStarted(begin);
        try {
            const blob = await renderWav(generator, minutes * 60, { onProgress: setProgress, signal: controller.signal });
            download(blob, fileName(minutes));
            setMessage(`Saved. That took ${clock((Date.now() - begin) / 1000)}.`);
        } catch (e) {
            setMessage(e.name === 'AbortError' ? 'Cancelled.' : `Sorry, saving failed: ${e.message}`);
        } finally {
            abort.current = null;
            setProgress(null);
        }
    };
    return (
        <details className="gen-settings gen-record" ref={menu}>
            <summary title="Save the music as an audio file">
                {progress === null ? 'Save audio' : `Saving… ${Math.round(progress * 100)}%`}
            </summary>
            <div className="gen-settings-menu">
                <label className="gen-field">
                    <span>Length</span>
                    <select value={minutes} disabled={progress !== null} onChange={(e) => setMinutes(Number(e.target.value))}>
                        {RECORD_MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}
                    </select>
                    <small>
                        Saves the piece from its beginning as a WAV file (about {megabytes} MB), with the sounds,
                        mix and ambience you have now. It is usually quicker than listening, and the music keeps
                        playing while it saves.
                    </small>
                </label>
                {progress === null ? (
                    <button type="button" onClick={render}>Save</button>
                ) : (
                    <>
                        <div className="gen-record-progress">
                            <progress value={progress} max="1" />
                            <button type="button" onClick={() => abort.current && abort.current.abort()}>Cancel</button>
                        </div>
                        <small role="status">
                            {Math.round(progress * 100)}%{left === null ? '' : ` · about ${clock(left)} left`}
                        </small>
                    </>
                )}
                {message && <small role="status">{message}</small>}
            </div>
        </details>
    );
};
