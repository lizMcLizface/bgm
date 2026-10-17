import React from 'react';
import { FLUID_LOOKS, FLUID_LIMITS, fluidLook, applyFluidLook, randomFluidOptions } from './fluidLooks';
import { DiceIcon } from '../icons';
import { SIM_RESOLUTIONS, DYE_RESOLUTIONS } from './fluid';

const QUALITY = { efficient: [256, 512], balanced: [512, 1024], high: [1024, 2048] };
const ADVANCED = [['balanceDrift', 'Balance drift'], ['spread', 'Colour spread'], ['glow', 'Dye brightness'],
    ['energyCap', 'Maximum motion energy'], ['velocityDiffusion', 'Velocity diffusion'], ['dyeDiffusion', 'Dye diffusion'],
    ['velocityDissipation', 'Velocity fade rate'], ['dissipation', 'Dye fade rate']];
const format = (key, value) => ['fullness', 'motionBalance', 'balanceDrift'].includes(key) ? Math.round(value * 100) + '%' : key.includes('Diffusion') ? (value === 0 ? 'Off' : value.toExponential(1))
    : key === 'energyCap' ? value.toFixed(5) : key === 'size' || key === 'speed' ? value.toFixed(2) + '×'
        : Number(value.toFixed(2)).toString();

export default function FluidControls({ options, onOptions, onClear }) {
    const set = (key, value) => onOptions({ ...options, [key]: value });
    const look = fluidLook(options);
    const quality = Object.entries(QUALITY).find(([, [sim, dye]]) => options.simResolution === sim && options.dyeResolution === dye)?.[0] || 'custom';
    const slider = (key, label) => {
        const [min, max, step] = FLUID_LIMITS[key];
        return <label key={key} className="gen-fluid-slider">
            <span>{label}</span><output>{format(key, options[key])}</output>
            <input type="range" min={min} max={max} step={step} value={options[key]} aria-label={label}
                onChange={(e) => set(key, Number(e.target.value))} />
        </label>;
    };
    return <div className="gen-fluid-controls">
        <div className="gen-fluid-heading">
            <span>Fluid settings</span>
            <button type="button" className="gen-dice" aria-label="Random fluid settings" title="Randomize fluid settings"
                onClick={() => { onOptions(randomFluidOptions(options)); onClear?.(); }}><DiceIcon /></button>
        </div>
        <label className="gen-menu-slider">
            <span>Flow look</span>
            <select value={look} aria-label="Flow look" onChange={(e) => { onOptions(applyFluidLook(options, e.target.value)); onClear?.(); }}>
                <option value="custom" disabled>Custom</option>
                {Object.entries(FLUID_LOOKS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
            </select>
        </label>
        <small>{FLUID_LOOKS[look]?.description || 'Adjusted from a look. Choose a look to return to a tuned starting point.'}</small>
        <label className="gen-menu-slider">
            <span>Quality</span>
            <select value={quality} aria-label="Fluid quality" onChange={(e) => {
                const [simResolution, dyeResolution] = QUALITY[e.target.value];
                onOptions({ ...options, simResolution, dyeResolution });
            }}>
                <option value="custom" disabled>Custom</option>
                <option value="efficient">Efficient · 256 / 512</option>
                <option value="balanced">Balanced · 512 / 1024</option>
                <option value="high">High · 1024 / 2048</option>
            </select>
        </label>
        {slider('fullness', 'Fullness')}
        <small>Spreads dye from the notes and audible ambience without adding motion. With ambience off, no background is generated.</small>
        <label className="gen-menu-slider">
            <span>Jet direction</span>
            <select value={options.jetDirection} aria-label="Jet direction" onChange={(e) => set('jetDirection', e.target.value)}>
                <option value="exhaust">Exhaust · behind source</option>
                <option value="forward">Along source path</option>
            </select>
        </label>
        {slider('speed', 'Motion speed')}
        {slider('motionBalance', 'Motion to source')}
        <small>Shares the motion budget: 0% keeps the source still with a strong jet; 100% moves the source with no jet. Exhaust points back along its path. Advanced Balance drift varies this share slowly per voice.</small>
        {slider('size', 'Emitter size')}
        {slider('vorticity', 'Swirl detail')}
        <label className="gen-fluid-slider">
            <span>Trail lifetime</span><output>{(Math.LN2 / options.dissipation).toFixed(1)} s</output>
            <input type="range" aria-label="Trail lifetime" min={0.7} max={8.7} step={0.1}
                value={Math.LN2 / options.dissipation} onChange={(e) => set('dissipation', Math.LN2 / Number(e.target.value))} />
        </label>
        <small>Dye fades by half over this time. Each voice wanders as one source; notes stay close to its path. Short notes make smaller, faster jets.</small>
        <button type="button" className="gen-menu-wide" onClick={onClear}>Clear flow</button>
        <small>Clear old colour and motion to judge your changes. Music keeps playing.</small>
        <details className="gen-fluid-advanced">
            <summary>Advanced fluid settings</summary>
            <div className="gen-fluid-controls">
                <label className="gen-check"><input type="checkbox" checked={options.trails} onChange={(e) => set('trails', e.target.checked)} />Moving note trajectories</label>
                {[['simResolution', 'Simulation resolution', SIM_RESOLUTIONS], ['dyeResolution', 'Dye resolution', DYE_RESOLUTIONS]].map(([key, label, choices]) =>
                    <label key={key} className="gen-menu-slider"><span>{label}</span>
                        <select value={options[key]} aria-label={label} onChange={(e) => set(key, Number(e.target.value))}>
                            {choices.map((n) => <option key={n} value={n}>{n} px</option>)}
                        </select>
                    </label>)}
                {ADVANCED.map(([key, label]) => slider(key, label))}
                <small>Diffusion spreads a field into neighbouring cells. Fade removes it. Larger emitters and longer lifetimes fill the canvas faster.</small>
            </div>
        </details>
    </div>;
}
