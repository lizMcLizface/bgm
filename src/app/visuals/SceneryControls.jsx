import React from 'react';
import { BIOME_NAMES, WEATHER } from '../../scenery/catalog';
import { seasonName } from '../../scenery/seasons';
import { DiceIcon } from '../icons';
import { DAY_MINUTES, SEASON_MINUTES } from '../SceneryBackdrop';

const clock = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

// Options for the pixel landscape background (SceneryBackdrop).
export default function SceneryControls({ options, onOptions }) {
    const set = (key, value) => onOptions({ ...options, [key]: value });
    return <div className="gen-fluid-controls">
        <div className="gen-fluid-heading">
            <span>Landscape</span>
            <button type="button" className="gen-dice" aria-label="New landscape" title="A new landscape of this kind"
                onClick={() => set('seed', Math.floor(Math.random() * 1e6))}><DiceIcon /></button>
        </div>
        <label className="gen-menu-slider">
            <span>Kind</span>
            <select value={options.biome} aria-label="Landscape kind" onChange={(e) => set('biome', e.target.value)}>
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
            <select value={options.time} aria-label="Time of day" onChange={(e) => set('time', e.target.value)}>
                <option value="cycle">Passes, {DAY_MINUTES} min a day</option>
                <option value="clock">Follows the clock</option>
                <option value="fixed">Stays put</option>
            </select>
        </label>
        {options.time === 'fixed' && <label className="gen-fluid-slider">
            <span>Hour</span><output>{clock(options.hour)}</output>
            <input type="range" min={0} max={23.9} step={0.1} value={options.hour} aria-label="Hour" onChange={(e) => set('hour', Number(e.target.value))} />
        </label>}
        <label className="gen-menu-slider">
            <span>Season</span>
            <select value={options.season} aria-label="Season" onChange={(e) => set('season', e.target.value)}>
                <option value="cycle">Passes, {SEASON_MINUTES / 60} hour a season</option>
                <option value="calendar">Follows the calendar</option>
                <option value="fixed">Stays put</option>
            </select>
        </label>
        {options.season === 'fixed' && <label className="gen-fluid-slider">
            <span>Time of year</span><output>{seasonName(options.year)}</output>
            <input type="range" min={0} max={3.99} step={0.01} value={options.year} aria-label="Time of year" onChange={(e) => set('year', Number(e.target.value))} />
        </label>}
    </div>;
}
