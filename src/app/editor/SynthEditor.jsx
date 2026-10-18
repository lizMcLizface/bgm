// The one synth editor: PolySynth's panel, rebuilt from SYNTH_SCHEMA and
// pointed at whichever role is selected. Every control writes straight to
// that role's Instrument (Generator.setRoleParam), so edits are heard live
// while playing, or via Audition while stopped. Preset load/save/export/
// import lives in the header. Collapsed by default - it is a big panel and
// most of the time the starter presets are enough.

import React, { useEffect, useRef, useState } from 'react';
import { ThemeProvider } from 'styled-components';
import Knob from '../../components/Knob';
import KnobGrid from '../../components/KnobGrid';
import Module from '../../components/Module';
import Select from '../../components/Select';
import SYNTH_SCHEMA from './synthSchema';
import PresetPicker from './PresetPicker';
import { findPreset, saveUserPreset, deleteUserPreset, isUserPreset, exportPreset, importPresetFile } from './presetStore';

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// The panel components are styled-components reading a THEMES-shaped
// theme (src/styles/themes.js); derive one from the page's own tokens so
// the knobs follow light/dark like everything else.
const pageTheme = () => ({
    background: cssVar('--gen-surface'),
    lite: cssVar('--gen-border'),
    mid: cssVar('--gen-border'),
    strong: cssVar('--gen-text'),
    pop: cssVar('--gen-accent'),
    accent: cssVar('--gen-accent'),
});

function usePageTheme() {
    const [theme, setTheme] = useState(pageTheme);
    useEffect(() => {
        // the system setting, or the page's own theme toggle (theme.js)
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const update = () => setTheme(pageTheme());
        media.addEventListener('change', update);
        const observer = new MutationObserver(update);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => {
            media.removeEventListener('change', update);
            observer.disconnect();
        };
    }, []);
    return theme;
}

const Control = ({ control, params, context, onChange }) => {
    const { kind, key, label, props = {}, options, disabled } = control;
    const isDisabled = disabled ? disabled(params, context) : false;

    if (kind === 'choice') return <label>{label}<select aria-label={label} value={params[key]} onChange={e => onChange(key, e.target.value)}>{Object.entries(options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
    if (kind === 'select') {
        return <Select label={label} options={options} value={params[key]} onUpdate={(v) => onChange(key, v)} />;
    }
    if (kind === 'toggle') {
        return (
            <div className="gen-toggle">
                <button
                    type="button"
                    className={params[key] ? 'is-on' : ''}
                    aria-pressed={!!params[key]}
                    onClick={() => onChange(key, !params[key])}
                >
                    {params[key] ? 'On' : 'Off'}
                </button>
                <span>{label}</span>
            </div>
        );
    }
    const { round, min, max, ...knobProps } = props;
    return (
        <Knob
            label={label}
            value={params[key]}
            disabled={isDisabled}
            {...knobProps}
            onUpdate={(v) => onChange(key, round ? Math.round(v) : v)}
        />
    );
};

const SynthEditor = ({ generator, roles, role, onRoleChange, presetName, edited, onPresetLoaded, onEdited, open, onToggle, sectionRef }) => {
    const theme = usePageTheme();
    const [params, setParams] = useState(() => generator.getRolePreset(role));
    const [message, setMessage] = useState('');
    const [, setStoreVersion] = useState(0);
    const fileInput = useRef(null);

    // Re-read when the role or its preset changes from outside (role tabs,
    // the role panel's preset picker).
    useEffect(() => {
        setParams(generator.getRolePreset(role));
    }, [generator, role, presetName]);

    const context = { polyphony: generator.getRolePolyphony(role) };
    const flash = (text) => {
        setMessage(text);
        setTimeout(() => setMessage(''), 2500);
    };

    const change = (key, value) => {
        generator.setRoleParam(role, key, value);
        setParams((p) => ({ ...p, [key]: value }));
        if (!edited) onEdited(role);
    };

    const load = (name) => {
        if (generator.loadRolePreset(role, name)) onPresetLoaded(role, name);
    };

    const saveAs = () => {
        const name = window.prompt('Save preset as', edited ? `${presetName} (edit)` : presetName);
        if (!name) return;
        if (!isUserPreset(name) || window.confirm(`Replace your preset "${name}"?`)) {
            if (saveUserPreset(name, generator.getRolePreset(role))) {
                if (generator.loadRolePreset(role, name)) onPresetLoaded(role, name);
                setStoreVersion((v) => v + 1);
                flash(`Saved "${name}"`);
            } else {
                flash('Could not save (browser storage unavailable) - use Export instead');
            }
        }
    };

    const remove = () => {
        if (!window.confirm(`Delete your preset "${presetName}"?`)) return;
        deleteUserPreset(presetName);
        setStoreVersion((v) => v + 1);
        flash(`Deleted "${presetName}" (the sound stays loaded)`);
    };

    const importFile = async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            const { name, preset } = await importPresetFile(file);
            generator.loadRolePreset(role, name, preset);
            onPresetLoaded(role, name);
            onEdited(role);
            flash(`Imported "${name}" - Save as to keep it in the list`);
        } catch (err) {
            flash(`Import failed: ${err.message}`);
        }
    };

    const nativeControls=new Set(['gainAttack','gainDecay','gainSustain','gainRelease','masterVolume']);
    const modules=params.wasmVoice
        ? SYNTH_SCHEMA.map(m=>({...m,label:m.label==='Master Limiter'?'Level':m.label,controls:m.controls.filter(c=>nativeControls.has(c.key))})).filter(m=>m.controls.length)
        : SYNTH_SCHEMA.filter(({ label }) => ['VCO', 'FM'].includes(label) ? !['plucked', 'piano'].includes(params.stringModel) : label === 'Plucked string' ? params.stringModel === 'plucked' : label === 'Piano' ? params.stringModel === 'piano' : true);

    return (
        <section className="gen-editor" ref={sectionRef}>
            <div className="gen-editor-head">
                <h2>Sound design</h2>
                <button type="button" aria-expanded={open} aria-controls="gen-editor-body" onClick={onToggle}>
                    {open ? 'Hide synth' : 'Show synth'}
                </button>
                {open && (
                    <div className="gen-tabs" role="tablist">
                        {Object.entries(roles).map(([id, { label }]) => (
                            <button
                                key={id}
                                role="tab"
                                type="button"
                                aria-selected={id === role}
                                className={id === role ? 'is-active' : ''}
                                onClick={() => onRoleChange(id)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {open && (
                <div id="gen-editor-body" className="gen-editor-body">
                    <div className="gen-editor-presets">
                        <PresetPicker value={presetName} edited={edited} onChange={load} role={role} />
                        <button type="button" onClick={() => generator.audition(role)}>Audition</button>
                        <button type="button" onClick={saveAs}>Save as…</button>
                        <button type="button" onClick={() => load(presetName)} disabled={!edited || !findPreset(presetName)}>Revert</button>
                        <button type="button" onClick={() => exportPreset(presetName, generator.getRolePreset(role))}>Export</button>
                        <button type="button" onClick={() => fileInput.current.click()}>Import</button>
                        {isUserPreset(presetName) && <button type="button" onClick={remove}>Delete</button>}
                        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importFile} />
                        <span className="gen-editor-message" role="status">{message}</span>
                    </div>

                    {params.wasmVoice&&<p className="gen-hint">New Wasm voice: shape its envelope and level here, or compare its full sound in the <a href="/labs/all/">Instrument labs</a>.</p>}
                    <ThemeProvider theme={theme}>
                        <div className="gen-modules">
                            {modules.map(({ label, columns, controls }) => (
                                <div className={`gen-module ${columns >= 7 ? 'gen-module-full' : columns >= 3 ? 'gen-module-wide' : ''}`} key={label}>
                                    <Module label={label}>
                                        <KnobGrid columns={columns} rows={Math.ceil(controls.length / columns)}>
                                            {controls.map((control) => (
                                                <Control
                                                    key={control.key}
                                                    control={control}
                                                    params={params}
                                                    context={context}
                                                    onChange={change}
                                                />
                                            ))}
                                        </KnobGrid>
                                    </Module>
                                </div>
                            ))}
                        </div>
                    </ThemeProvider>
                </div>
            )}
        </section>
    );
};

export default SynthEditor;
