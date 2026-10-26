import React from 'react';
import { BIOME_NAMES, WEATHER } from '../../scenery/catalog';
import { seasonName } from '../../scenery/seasons';
import { DiceIcon } from '../icons';
import { DAY_MINUTES, SEASON_MINUTES } from '../SceneryBackdrop';

const clock = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

// The preset's window as words: "20:00 and 05:00", "Early winter to Late winter".
const hoursText = ([a, b]) => `${clock(a)} and ${clock(b)}`;
const seasonsText = ([a, b]) => `${seasonName(a)} to ${seasonName(b - 0.01)}`;

// Options for the pixel landscape background (SceneryBackdrop).
export default function SceneryControls({ options, onOptions }) {
    const set = (key, value) => onOptions({ ...options, [key]: value });
    return <div className="gen-fluid-controls">
        <div className="gen-fluid-heading">
            <span>Landscape</span>
            <button type="button" className="gen-dice" aria-label="New landscape" title="A new landscape of this kind"
                onClick={() => set('seed', Math.floor(Math.random() * 1e6))}><DiceIcon /></button>
        </div>
        <label className="gen-check">
            <input type="checkbox" checked={options.follow} onChange={(e) => onOptions({ ...options, follow: e.target.checked, ...(!e.target.checked && { hours: null, seasons: null }) })} />
            Preset picks the landscape
        </label>
        <label className="gen-check">
            <input type="checkbox" checked={options.moveTime} onChange={(e) => onOptions({ ...options, moveTime: e.target.checked, time: e.target.checked ? 'cycle' : 'fixed' })} />
            Time of day keeps changing
        </label>
        <label className="gen-check">
            <input type="checkbox" checked={options.moveSeason} onChange={(e) => onOptions({ ...options, moveSeason: e.target.checked, season: e.target.checked ? 'cycle' : 'fixed' })} />
            Seasons keep changing
        </label>
        <label className="gen-menu-slider">
            <span>Kind</span>
            <select value={options.biome} aria-label="Landscape kind" onChange={(e) => onOptions({ ...options, biome: e.target.value, hours: null, seasons: null, look: null })}>
                {Object.entries(BIOME_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
        </label>
        <label className="gen-menu-slider">
            <span>Weather</span>
            <select value={options.weather} aria-label="Weather" onChange={(e) => set('weather', e.target.value)}>
                <option value="auto">Changing</option>
                {Object.entries(WEATHER).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
        </label>
        <label className="gen-menu-slider">
            <span>Time of day</span>
            <select value={options.time} aria-label="Time of day" onChange={(e) => onOptions({ ...options, time: e.target.value, hours: null })}>
                <option value="cycle">Passes, {DAY_MINUTES} min a day</option>
                <option value="clock">Follows the clock</option>
                <option value="fixed">Stays put</option>
            </select>
        </label>
        {options.hours && options.time !== 'fixed' && <p className="gen-hint">The preset keeps it between {hoursText(options.hours)}.</p>}
        {options.time === 'fixed' && <label className="gen-fluid-slider">
            <span>Hour</span><output>{clock(options.hour)}</output>
            <input type="range" min={0} max={23.9} step={0.1} value={options.hour} aria-label="Hour" onChange={(e) => set('hour', Number(e.target.value))} />
        </label>}
        <label className="gen-menu-slider">
            <span>Season</span>
            <select value={options.season} aria-label="Season" onChange={(e) => onOptions({ ...options, season: e.target.value, seasons: null })}>
                <option value="cycle">Passes, {SEASON_MINUTES / 60} hour a season</option>
                <option value="calendar">Follows the calendar</option>
                <option value="fixed">Stays put</option>
            </select>
        </label>
        {options.seasons && options.season !== 'fixed' && <p className="gen-hint">The preset keeps it to {seasonsText(options.seasons)}.</p>}
        {options.season === 'fixed' && <label className="gen-fluid-slider">
            <span>Time of year</span><output>{seasonName(options.year)}</output>
            <input type="range" min={0} max={3.99} step={0.01} value={options.year} aria-label="Time of year" onChange={(e) => set('year', Number(e.target.value))} />
        </label>}
    </div>;
}
