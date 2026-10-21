// The calmbgm synth on the /synths touch panel: the same faders and choice buttons as DIY Poly,
// editing the voice's preset live (Generator.setRoleParam) through nativeParams' table.
import React, { useMemo } from 'react';
import EmbeddedShell, { EnsemblePanelContext } from '../../synths/ui/EmbeddedShell';
import { NATIVE_SYNTH, toPanel, panelChanges, panelModules } from './nativeParams';

const TONES = { 'Sound source': 'cream', Piano: 'cream', 'Plucked string': 'cream', VCO: 'cream', FM: 'violet', Voices: 'teal', Noise: 'cream', 'Gain Envelope': 'blue', 'Envelope Shape': 'blue',
    'Pitch Envelope': 'amber', Filter: 'red', 'Filter Motion': 'amber', Vibrato: 'violet', 'Tremolo / Auto-pan': 'violet', 'Master Filter': 'red', 'Master Limiter': 'green', Microtonal: 'teal' };

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

export default function NativePanel({ preset, part, polyphony, onChange }) {
    const values = useMemo(() => toPanel(preset), [preset]);
    const context = useMemo(() => ({ values, onChange: (next) => onChange(panelChanges(values, next)) }), [values, onChange]);
    return (
        <EnsemblePanelContext.Provider value={context}>
            <EmbeddedShell synth={NATIVE_SYNTH} className="native-instrument" panelClassName="diy-panel">
                {({ control, change }) => panelModules(preset, part, { polyphony }).map(({ title, keys }) => (
                    <section className="group" key={title} style={{ '--n': keys.length }}>
                        <h3>{title}</h3>
                        <div className="group-controls">{keys.map((key) => (NATIVE_SYNTH.params.BY_KEY[key].options?.length > 4 ? select(key, values, change) : control(key, TONES[title] ?? 'teal')))}</div>
                    </section>
                ))}
            </EmbeddedShell>
        </EnsemblePanelContext.Provider>
    );
}
