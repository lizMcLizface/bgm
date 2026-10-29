// The control panel: faders for the mix (in the voice's colour, named as the track strip names them) and the feel, the feel pad, where the chord root goes, and off / low / med / high stacks
// that move linked settings together (quickControls.js). Its heading, collapse and Reset are in
// GenerativeApp. Everything goes through the page's own handlers.
import React, { useEffect, useState } from 'react';
import FeelPad from './FeelPad';
import { MIX_SLIDERS, FEEL_SLIDERS, CHOICE_GROUPS, choiceAt, choicePaths, choicePatch, STACKS, LEVELS, readValue, sliderPatch, stackLevel, stackPatch, stackPaths, matchesPreset, presetPatch } from './quickControls';

// milliseconds as they are, everything else as a percentage of 1
const format = (value, { max }) => (max >= 20 ? `${Math.round(value)}` : `${Math.round(value * 100)}`);

// The cap snaps to the quarter marks when it is close to one, so 0, 25, 50, 75 and 100 are easy to land on.
export const snapToNotch = (value, min, max) => {
    const span = max - min, notch = min + Math.round(((value - min) / span) * 4) / 4 * span;
    return Math.abs(value - notch) <= span * 0.02 ? notch : value;
};

const Slider = ({ id, label, title, value, min = 0, max = 1, step = 0.01, onChange, colour, home, off = false }) => (
    <label className={`gen-quick-slider${off ? ' is-off' : ''}`} title={off ? title : `${title ? `${title}. ` : ''}Double-click to go back to ${home === undefined ? 'zero' : 'the preset'}`} style={colour ? { '--slider': colour } : undefined}>
        <output>{format(value, { min, max })}</output>
        <span className="gen-fader">
            <span className="gen-fader-ticks" aria-hidden="true" />
            <input type="range" orient="vertical" aria-label={label} aria-orientation="vertical" disabled={off} data-quick={id} min={min} max={max} step={step} value={value}
                style={{ '--fill': `${((value - min) / (max - min)) * 100}%` }}
                onChange={(e) => onChange(snapToNotch(Number(e.target.value), min, max))} onDoubleClick={() => onChange(home ?? min)} />
        </span>
        <span>{label}</span>
    </label>
);

// A column of round pill buttons, its name below like the sliders'. A level's pill has the level's colour
// (green low, yellow medium, red high); the choices of one setting share the group's. Exactly one
// lights up: the one picked, else Preset when the settings are still the preset's, else whichever level
// they happen to match, else none.
const Choices = ({ label, title, hue, options, active, onPick }) => (
    <div className="gen-quick-group gen-quick-pills" role="radiogroup" aria-label={label} title={title} style={{ '--hue': hue }}>
        <div className="gen-quick-choices">
            {options.map(({ key, label: text, title: hint, preset, hue: own }) => (
                <button key={key} type="button" role="radio" aria-checked={active === key} title={hint} style={own ? { '--hue': own } : undefined} className={`${preset ? 'is-preset' : ''}${active === key ? ' is-on' : ''}`}
                    onClick={() => onPick(key)}>{text}</button>
            ))}
        </div>
        <span className="gen-quick-label">{label}</span>
    </div>
);

const HUES = { choice: '#8f7ae0' };
const LEVEL_HUES = ['#8d9aa6', '#5fb878', '#e3b93a', '#e5654f']; // off, low, med, high
const PRESET = { key: 'preset', label: 'Preset', preset: true, title: 'As the preset has it' };

// `roleLabels`: each voice's name as the rest of the page has it (rhythm, percussion, ...).
// `baseline`: the preset's quick settings (Preset buttons); `resetKey` changes when Reset is pressed.
export default function QuickPanel({ settings, roleLabels = {}, onVolume, onSettings, onFeel, baseline, resetKey = 0 }) {
    const [picked, setPicked] = useState({});
    useEffect(() => setPicked({}), [baseline, resetKey]);
    const onPreset = (paths) => !!baseline && matchesPreset(settings, baseline, paths);
    const pick = (id, key, patch) => { setPicked((p) => ({ ...p, [id]: key })); onSettings(patch); };
    const settled = (id, at, paths) => (picked[id] !== undefined && picked[id] === at ? at : onPreset(paths) ? 'preset' : at);
    return (
        <div className="gen-quick" id="gen-desk">
            <div className="gen-quick-top">
                <div className="gen-quick-group" role="group" aria-label="Mix">
                    <div className="gen-quick-sliders">
                        {MIX_SLIDERS.map(({ id, label, role, path, title, off, offTitle }) => (role
                            ? <Slider key={id} id={id} label={roleLabels[role] ?? label} title={off?.(settings) ? offTitle : title} off={!!off?.(settings)} colour={`var(--gen-role-${role})`} home={baseline?.volumes?.[role]} value={settings.volumes?.[role] ?? 0} onChange={(v) => onVolume(role, v)} />
                            : <Slider key={id} id={id} label={label} title={title} home={baseline?.[path]} value={settings[path] ?? 0} onChange={(v) => onSettings({ [path]: v })} />))}
                    </div>
                </div>
                <div className="gen-quick-group gen-quick-pad" role="group" aria-label="Feel pad">
                    <FeelPad compact feel={settings.feel} onChange={onFeel} />
                </div>
                <div className="gen-quick-group gen-quick-feel" role="group" aria-label="Feel">
                    <div className="gen-quick-sliders">
                        {FEEL_SLIDERS.map((slider) => (
                            <Slider key={slider.id} id={slider.id} label={slider.label} title={slider.title} min={slider.min} max={slider.max} step={slider.step}
                                home={baseline && readValue(baseline, slider.path)} value={readValue(settings, slider.path) ?? 0} onChange={(v) => onSettings(sliderPatch(settings, slider.path, v))} />
                        ))}
                    </div>
                </div>
            </div>
            <div className="gen-quick-bottom">
                <div className="gen-quick-choices-row" role="group" aria-label="Chords and second lead">
                    {CHOICE_GROUPS.map((group) => {
                        const paths = choicePaths(group);
                        return (
                            <Choices key={group.id} label={group.label} title={group.title} hue={HUES.choice} active={settled(group.id, choiceAt(settings, group), paths)}
                                options={[...group.choices.map(({ value, label, title }) => ({ key: value, label, title })), ...(baseline ? [PRESET] : [])]}
                                onPick={(key) => pick(group.id, key, key === 'preset' ? presetPatch(settings, baseline, paths) : choicePatch(settings, group, key))} />
                        );
                    })}
                </div>
                <div className="gen-quick-choices-row gen-quick-stacks" role="group" aria-label="Feel stacks">
                    {STACKS.map((stack) => {
                        const paths = stackPaths(stack), at = stackLevel(settings, stack);
                        return (
                            <Choices key={stack.id} label={stack.label} title={stack.title} hue={HUES.choice} active={settled(stack.id, at, paths)}
                                options={[...[...LEVELS].map((level, index) => ({ key: index, label: level, hue: LEVEL_HUES[index] })).reverse(), ...(baseline ? [PRESET] : [])]}
                                onPick={(key) => pick(stack.id, key, key === 'preset' ? presetPatch(settings, baseline, paths) : stackPatch(settings, stack, key))} />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
