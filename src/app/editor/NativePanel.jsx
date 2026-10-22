// The calmbgm synth on the /synths touch panel: the same faders and choice buttons as DIY Poly,
// editing the voice's preset live (Generator.setRoleParam) through nativeParams' table.
import React, { useMemo } from 'react';
import EmbeddedShell, { EnsemblePanelContext } from '../../synths/ui/EmbeddedShell';
import { NATIVE_SYNTH, toPanel, panelChanges, panelModules } from './nativeParams';
import RackGraphic from '../../synths/effects/RackGraphic';
import '../../synths/effects/rack.css';

const TONES = { 'Sound source': 'cream', Piano: 'cream', 'Plucked string': 'cream', VCO: 'cream', FM: 'violet', Voices: 'teal', Noise: 'cream', 'Gain Envelope': 'blue', 'Envelope Shape': 'blue',
    'Pitch Envelope': 'amber', Filter: 'red', 'Filter Motion': 'amber', Vibrato: 'violet', 'Tremolo / Auto-pan': 'violet', 'Master Filter': 'red', 'Master Limiter': 'green', Microtonal: 'teal' };

// The Effects tab's modules as the effects rack draws them (synths/effects): its companion and colour,
// lit while the effect is mixed in.
// `on` says when the effect is heard.
const EFFECTS = {
    Drive: ['saturation', '#e2a369', (p) => p.distortionAmount > 0],
    Tape: ['tape', '#d8b98c', (p) => p.tapeWow > 0 || p.tapeFlutter > 0 || p.tapeDrive > 0],
    Crush: ['crush', '#e58f8f', (p) => p.bitCrushAmount > 0, 'Bitcrusher'],
    EQ2: ['eq', '#afcb7a', (p) => !!(p.eqLowGain || p.eqMidGain || p.eqHighGain), 'Equalizer'],
    Compressor: ['compressor', '#f0bd79', (p) => p.compAmount > 0],
    Chorus: ['chorus', '#7fc7b6', (p) => p.chorusAmount > 0],
    Flanger: ['flanger', '#8bbce5', (p) => p.flangerAmount > 0],
    Phaser: ['phaser', '#b0a0e6', (p) => p.phaserAmount > 0],
    'Tremolo / Auto-pan': ['tremolo', '#c9a6e8', (p) => p.tremoloDepth > 0 || p.autoPanDepth > 0],
    Delay: ['delay', '#dca7cf', (p) => p.delayAmount > 0],
    'Ping Pong Delay': ['pingpong', '#dca7cf', (p) => p.pingPongAmount > 0, 'Ping-pong delay'],
    Reverb: ['reverb', '#9cbbb8', (p) => p.reverbAmount > 0],
    Shimmer: ['shimmer', '#a9c8ec', (p) => p.shimmerMix > 0],
    Freeze: ['freeze', '#9fd6e0', (p) => p.freezeMix > 0],
};

// Long lists (waveforms, filter and reverb types) as menus, as DIY Poly shows them; short ones as buttons.
const select = (key, values, change) => {
    const spec = NATIVE_SYNTH.params.BY_KEY[key];
    return (
        <label className="diy-select" key={key}>{spec.label}
            <select aria-label={spec.label} value={values[key]} onChange={(e) => change(key, Number(e.target.value))}>
                {spec.options.map((name, i) => <option key={i} value={i}>{name}</option>)}
            </select>
        </label>
    );
};

export default function NativePanel({ preset, part, polyphony, engine, onChange }) {
    const values = useMemo(() => toPanel(preset), [preset]);
    const context = useMemo(() => ({ values, onChange: (next) => onChange(panelChanges(values, next, preset)) }), [values, onChange, preset]);
    return (
        <EnsemblePanelContext.Provider value={context}>
            <EmbeddedShell synth={NATIVE_SYNTH} className="native-instrument" panelClassName="diy-panel">
                {({ control, change }) => panelModules(preset, part, { polyphony, engine }).map(({ title, keys }) => {
                    const controls = <div className="group-controls">{keys.map((key) => (NATIVE_SYNTH.params.BY_KEY[key].options?.length > 4 ? select(key, values, change) : control(key, TONES[title] ?? 'teal')))}</div>;
                    const effect = EFFECTS[title];
                    if (!effect) return <section className="group" key={title} style={{ '--n': keys.length }}><h3>{title}</h3>{controls}</section>;
                    const [kind, colour, heard, name = title] = effect;
                    const on = heard(preset);
                    return (
                        <section className={'group native-effect' + (on ? '' : ' is-idle') + (keys.length > 6 ? ' wide' : '')} key={title} style={{ '--n': keys.length, '--rack-colour': colour }}>
                            <header><RackGraphic kind={kind} on={on} /><h3>{name}</h3></header>
                            {controls}
                        </section>
                    );
                })}
            </EmbeddedShell>
        </EnsemblePanelContext.Provider>
    );
}
