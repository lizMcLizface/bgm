// The control panel: faders for the mix (in the voice's colour, named as the track strip names them) and the feel, the feel pad, where the chord root goes, and off / low / med / high stacks
// that move linked settings together (quickControls.js). Its heading, collapse and Reset are in
// GenerativeApp. Everything goes through the page's own handlers.
import React, { useEffect, useState } from 'react';
import FeelPad from './FeelPad';
import IntensityFader from './IntensityFader';
import MoodFader from './MoodFader';
import { voiceLayers as layersOf } from './arranger';
import { songPartCan } from './composition/songParts';
import { MELODY_PLAN, MELODY_STYLE, MELODY_PARTS, MIX_SLIDERS, FEEL_SLIDERS, CHOICE_GROUPS, choiceAt, choicePaths, choicePatch, STACKS, LEVELS, readValue, sliderPatch, stackLevel, stackPatch, stackPaths, matchesPreset, presetPatch } from './quickControls';

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
const Choices = ({ label, title, hue, options, active, onPick, wide = false }) => (
    <div className={`gen-quick-group gen-quick-pills${wide ? ' is-wide' : ''}`} role="radiogroup" aria-label={label} title={title} style={{ '--hue': hue }}>
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

// The melody row: its own line across the panel, so it never pushes the columns above it wider. A style or a part only
// means something in a song, so picking either while the lead noodles starts one.
const MelodyRow = ({ settings, baseline, settled, pick, onSettings }) => {
    const noodling = choiceAt(settings, MELODY_PLAN) === 'noodle';
    // (the Preset pill says what the preset has, so its plan and style can be seen before changing them)
    const presetPill = (group) => {
        if (!baseline) return [];
        const named = group.choices.find((choice) => choice.value === choiceAt(baseline, group))?.label;
        return [named ? { ...PRESET, label: `Preset: ${named}` } : PRESET];
    };
    const pills = (group) => [...group.choices.map(({ value, label, title }) => ({ key: value, label, title })), ...presetPill(group)];
    return (
        <div className="gen-quick-melody" role="group" aria-label="Melody controls">
            <Choices wide label={MELODY_PLAN.label} title={MELODY_PLAN.title} hue={HUES.choice} options={pills(MELODY_PLAN)} active={settled(MELODY_PLAN.id, choiceAt(settings, MELODY_PLAN), choicePaths(MELODY_PLAN))}
                onPick={(key) => pick(MELODY_PLAN.id, key, key === 'preset' ? presetPatch(settings, baseline, choicePaths(MELODY_PLAN)) : choicePatch(settings, MELODY_PLAN, key))} />
            <div className={noodling ? 'gen-quick-melody-song is-idle' : 'gen-quick-melody-song'}>
                <Choices wide label={MELODY_STYLE.label} title={MELODY_STYLE.title} hue={HUES.choice} options={pills(MELODY_STYLE)} active={settled(MELODY_STYLE.id, choiceAt(settings, MELODY_STYLE), choicePaths(MELODY_STYLE))}
                    onPick={(key) => pick(MELODY_STYLE.id, key, key === 'preset' ? presetPatch(settings, baseline, choicePaths(MELODY_STYLE))
                        : { ...choicePatch(settings, MELODY_STYLE, key), ...(noodling ? choicePatch(settings, MELODY_PLAN, 'same') : {}) })} />
                <div className="gen-quick-group gen-quick-pills is-wide" role="group" aria-label="Parts in the song">
                    <div className="gen-quick-choices">
                        {MELODY_PARTS.map(({ id, label, path, title }) => {
                            const on = readValue(settings, path) !== false, can = songPartCan(settings, id);
                            return <button key={id} type="button" role="switch" aria-checked={on && can} title={can ? title : `This preset has no such part: ${title}`} disabled={!can} className={on && can ? 'is-on' : ''}
                                onClick={() => onSettings({ ...sliderPatch(settings, path, !on), ...(noodling ? choicePatch(settings, MELODY_PLAN, 'same') : {}) })}>{label}</button>;
                        })}
                    </div>
                    <span className="gen-quick-label">In the song</span>
                </div>
            </div>
        </div>
    );
};

// `roleLabels`: each voice's name as the rest of the page has it (rhythm, percussion, ...).
// `baseline`: the preset's quick settings (Preset buttons); `resetKey` changes when Reset is pressed.
export default function QuickPanel({ settings, layersUnlocked = true, roleLabels = {}, onVolume, onSettings, onFeel, onPush, nowLevel = 0, onMood, nowMood = 0, baseline, resetKey = 0 }) {
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
                        {MIX_SLIDERS.filter(({ id }) => id !== 'rhythm' || (layersUnlocked && !['combined', 'pad'].includes(layersOf(settings)))).map(({ id, label, role, path, title, off, offTitle }) => (role
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
                    {CHOICE_GROUPS.filter((group) => !['layers', 'flow'].includes(group.id) || layersUnlocked || layersOf(settings) !== 'combined').map((group) => {
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
            <MelodyRow settings={settings} baseline={baseline} settled={settled} pick={pick} onSettings={onSettings} />
            </div>
            {onPush && settings.push && (
                <div className="gen-quick-intensity">
                    <IntensityFader push={settings.push} now={nowLevel} onChange={onPush} />
                    {onMood && settings.mood && <MoodFader mood={settings.mood} now={nowMood} onChange={onMood} />}
                </div>
            )}
        </div>
    );
}
