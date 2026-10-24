// The synth editor's panel as data: modules of controls, each bound to one
// preset key. Knob props (modifier/offset/scaling/...) are copied from
// PolySynth.jsx's panel so every control behaves as it does in unCAGED's
// synth tab. Left out on purpose: polyphony (fixed per role by the
// generator), arpeggiator/progression/chord capture (the generator plays),
// spectrum views and theme picker.

import { WAVEFORM, FILTER, REVERB, ENVELOPE_SHAPE, NOISE } from '../../util/util';
import { TEMPERAMENTS, TONICS } from '../engine/temperament';
import { isAcousticPiano } from '../engine/acousticPiano';

const knob = (key, label, props = {}, disabled) => ({ kind: 'knob', key, label, props, disabled });
const select = (key, label, options, disabled) => ({ kind: 'select', key, label, options, disabled });
const toggle = (key, label) => ({ kind: 'toggle', key, label });

const osc2Off = (p) => p.osc2Type === 'off';
const DRY_WET = 'Mix';

const pitchKnob = (key, label) => knob(key, label, { modifier: 1.5, offset: 0.5, resetValue: 1.0, decimalPlaces: 3 });

const SYNTH_SCHEMA = [
    { label: 'Sound source', columns: 2, controls: [
        { kind: 'choice', key: 'stringModel', label: 'Source', options: { oscillator: 'Oscillator', plucked: 'Plucked string', piano: 'Piano' } },
    ] },
    { label: 'Piano', columns: 4, controls: [
        { kind: 'choice', key: 'pianoType', label: 'Piano tone', options: { felt: 'Felt', electric: 'Electric', grand: 'Grand', felted: 'Felted', upright: 'Upright', ambient: 'Ambient', glass: 'Glass grand', drama: 'Soft drama', soft: 'Soft piano', subdued: 'Subdued', concert: 'Concert grand' } },
        knob('pianoDecay', 'Decay', { modifier: 4.7, offset: .3, min: .3, max: 5, resetValue: 2.5 }),
        knob('pianoResonance', 'Resonance', { min: 0, max: 1, resetValue: 0 }),
        knob('pianoSustain', 'Held body', { min: 0, max: 1, resetValue: .28 }),
        knob('pianoBrightness', 'Brightness', { min: 0, max: 1, resetValue: .45 }),
        knob('pianoHammer', 'Hammer', { min: 0, max: 1, resetValue: .3 }),
        knob('pianoUnison', 'Unison', { min: 0, max: 1, resetValue: .25 }),
        knob('pianoWear', 'Age', { min: 0, max: 1, resetValue: 0 }, (p) => !isAcousticPiano(p.pianoType)),
    ] },
    { label: 'Piano tuning', columns: 4, controls: [
        { kind: 'choice', key: 'pianoTemperament', label: 'Temperament', options: TEMPERAMENTS },
        { kind: 'choice', key: 'pianoTonic', label: 'Centred on', options: Object.fromEntries(TONICS.map((t) => [t, t])) },
        knob('pianoA4', 'A4 pitch', { modifier: 100, offset: 380, min: 380, max: 480, resetValue: 440, decimalPlaces: 1 }),
        knob('pianoStretch', 'Stretch', { min: 0, max: 1, resetValue: 0 }),
    ] },
    { label: 'Plucked string', columns: 4, controls: [
        knob('stringDecay', 'Decay', { modifier: 4.85, offset: .15, min: .15, max: 5, resetValue: 2 }),
        knob('stringDamping', 'Damping', { min: 0, max: 1, resetValue: .5 }),
        knob('stringPosition', 'Pick position', { modifier: .4, offset: .05, min: .05, max: .45, resetValue: .2 }),
        knob('stringBody', 'Body', { min: 0, max: 1, resetValue: .25 }),
    ] },
    {
        label: 'VCO',
        columns: 4,
        controls: [
            select('vcoType', 'Waveform', WAVEFORM),
            knob('vcoDutyCycle', 'Duty Cycle', { min: 0.01, max: 0.99 }, (p) => p.vcoType !== 'square_dc'),
            knob('subOscOctaveOffset', 'Sub Osc', { modifier: 6, offset: -3, decimalPlaces: 0, round: true }),
            select('subOscType', 'Sub Wave', WAVEFORM),
            select('osc2Type', 'Osc2 Wave', WAVEFORM),
            knob('osc2DutyCycle', 'Osc2 Duty', { min: 0.01, max: 0.99 }, (p) => p.osc2Type !== 'square_dc'),
            knob('osc2Detune', 'Osc2 Detune', { modifier: 100, min: -100, max: 100, resetValue: 0, decimalPlaces: 1 }, osc2Off),
            knob('osc2OctaveOffset', 'Osc2 Octave', { modifier: 6, offset: -3, decimalPlaces: 0, round: true }, osc2Off),
            knob('osc2Amount', 'Osc2 Amount', { min: 0, max: 1, resetValue: 0 }, osc2Off),
            knob('osc2PhaseOffset', 'Osc2 Phase', { modifier: 360, min: 0, max: 360, resetValue: 0, decimalPlaces: 0, round: true }, osc2Off),
        ],
    },
    {
        label: 'FM',
        columns: 4,
        controls: [
            knob('fmRatio', 'Ratio', { modifier: 7.5, offset: 0.5, resetValue: 1, decimalPlaces: 2 }),
            knob('fmIndex', 'Index', { modifier: 10, resetValue: 0 }),
            knob('fmEnvAmount', 'Strike', { modifier: 20, resetValue: 0 }),
            knob('fmDecay', 'Strike Decay', { modifier: 3, resetValue: 0.5 }, (p) => !(p.fmEnvAmount > 0)),
        ],
    },
    {
        label: 'Voices',
        columns: 3,
        controls: [
            knob('voiceCount', 'Voices', { modifier: 8, offset: 1, min: 1, max: 8, resetValue: 1, decimalPlaces: 0, round: true }),
            knob('detuneSpread', 'Detune Spread', { modifier: 100, min: 0, max: 100, resetValue: 0, decimalPlaces: 1 }),
            knob('stereoSpread', 'Stereo Spread', { modifier: 100, min: 0, max: 100, resetValue: 0, decimalPlaces: 1 }),
            knob('portamentoSpeed', 'Portamento', { modifier: 0.5 }, (p, ctx) => ctx.polyphony !== 1),
        ],
    },
    {
        label: 'Noise',
        columns: 2,
        controls: [
            select('noiseType', 'Type', NOISE),
            knob('noiseMix', 'Mix', { min: 0, max: 1 }),
            toggle('noiseFilterEnabled', 'Filter'),
            knob('noiseFilterQ', 'Filter Q', { modifier: 10, min: 0.1, max: 30 }, (p) => !p.noiseFilterEnabled),
        ],
    },
    {
        label: 'Gain Envelope',
        columns: 3,
        controls: [
            knob('gainAttack', 'Attack', { modifier: 3 }),
            knob('gainDecay', 'Decay', { modifier: 3 }),
            knob('gainSustain', 'Sustain', { modifier: 0.7 }),
            knob('gainRelease', 'Release', { modifier: 3 }),
            knob('gainHold', 'Hold', { modifier: 3 }),
            knob('gainHoldLevel', 'Hold Level', { modifier: 3 }),
        ],
    },
    {
        label: 'Envelope Shape',
        columns: 3,
        controls: [
            select('envelopeAttackShape', 'Attack', ENVELOPE_SHAPE),
            select('envelopeDecayShape', 'Decay', ENVELOPE_SHAPE),
            select('envelopeReleaseShape', 'Release', ENVELOPE_SHAPE),
            knob('envelopeAttackExponent', 'Attack Exp', { modifier: 4, offset: 0.1, resetValue: 2, decimalPlaces: 1 }),
            knob('envelopeDecayExponent', 'Decay Exp', { modifier: 4, offset: 0.1, resetValue: 2, decimalPlaces: 1 }),
            knob('envelopeReleaseExponent', 'Release Exp', { modifier: 4, offset: 0.1, resetValue: 2, decimalPlaces: 1 }),
        ],
    },
    {
        label: 'Pitch Envelope',
        columns: 2,
        controls: [
            knob('pitchEnvAmount', 'Amount', { type: 'B', modifier: 2400, resetValue: 0, decimalPlaces: 0, isRounded: true }),
            knob('pitchEnvDecay', 'Decay', { modifier: 1, resetValue: 0.05, decimalPlaces: 3 }),
        ],
    },
    {
        label: 'Filter',
        columns: 4,
        controls: [
            select('filterType', 'Type', FILTER),
            knob('filterFreq', 'Cutoff', { scalingType: 'logarithmic', minValue: 20, maxValue: 11020, resetValue: 11000, isRounded: true }),
            knob('filterQ', 'Q', { modifier: 20 }),
            knob('filterGain', 'Gain', { type: 'B', modifier: 40 }),
            knob('filterAttack', 'Attack', { modifier: 3 }),
            knob('filterDecay', 'Decay', { modifier: 3 }),
            knob('filterRelease', 'Release', { modifier: 3 }),
            knob('filterEnvAmount', 'Amount', { type: 'A', modifier: 11000, isRounded: true }),
        ],
    },
    {
        label: 'Filter Motion',
        columns: 4,
        controls: [
            knob('filterLfoRate', 'LFO Rate', { scalingType: 'logarithmic', minValue: 0.01, maxValue: 10, resetValue: 0.2, decimalPlaces: 2 }),
            knob('filterLfoDepth', 'LFO Depth', { modifier: 2400, resetValue: 0, isRounded: true }),
            knob('filterKeyTrack', 'Key Track', { modifier: 1, resetValue: 0 }),
            knob('filterVelocity', 'Velocity', { modifier: 4800, resetValue: 0, isRounded: true }),
        ],
    },
    {
        label: 'Vibrato',
        columns: 2,
        controls: [
            knob('vibratoDepth', 'Depth', { modifier: 200 }),
            knob('vibratoRate', 'Rate', { modifier: 50 }),
        ],
    },
    // The effects keep to ranges that stay musical and stable (feedback below runaway, the phaser's
    // sweep inside its centre); `unit` overrides the guess from the label. Values outside a range
    // in an older preset are only clamped on the panel, not rewritten.
    {
        label: 'Drive',
        columns: 2,
        controls: [
            knob('distortionDist', 'Drive', { min: 0, max: 12, resetValue: 6, decimalPlaces: 1 }),
            knob('distortionAmount', DRY_WET),
        ],
    },
    {
        label: 'Tape',
        columns: 3,
        controls: [
            knob('tapeWow', 'Wow', { min: 0, max: 1 }),
            knob('tapeWowRate', 'Wow rate', { scalingType: 'logarithmic', minValue: 0.1, maxValue: 3, resetValue: 0.6, unit: 'Hz' }),
            knob('tapeFlutter', 'Flutter', { min: 0, max: 1 }),
            knob('tapeDrive', 'Saturation', { min: 0, max: 1 }),
            knob('tapeTone', 'Tone', { scalingType: 'logarithmic', minValue: 2000, maxValue: 16000, resetValue: 9000, isRounded: true }),
        ],
    },
    {
        label: 'Crush',
        columns: 2,
        controls: [
            knob('bitCrushDepth', 'Bits', { modifier: 14, offset: 2, resetValue: 8, isRounded: true }),
            knob('bitCrushAmount', DRY_WET),
        ],
    },
    {
        label: 'EQ2',
        columns: 2,
        controls: [
            knob('eqLowGain', 'Low Gain', { type: 'B', modifier: 12, resetValue: 0, unit: 'dB' }),
            knob('eqLowFreq', 'Low Freq', { scalingType: 'logarithmic', minValue: 40, maxValue: 640, resetValue: 320, isRounded: true }),
            knob('eqMidGain', 'Mid Gain', { type: 'B', modifier: 12, resetValue: 0, unit: 'dB' }),
            knob('eqMidFreq', 'Mid Freq', { scalingType: 'logarithmic', minValue: 200, maxValue: 6000, resetValue: 1000, isRounded: true }),
            knob('eqMidQ', 'Mid Q', { scalingType: 'logarithmic', minValue: 0.3, maxValue: 4, resetValue: 0.7, unit: 'decimal' }),
            knob('eqHighGain', 'High Gain', { type: 'B', modifier: 12, resetValue: 0, unit: 'dB' }),
            knob('eqHighFreq', 'High Freq', { scalingType: 'logarithmic', minValue: 1500, maxValue: 12000, resetValue: 3200, isRounded: true }),
        ],
    },
    {
        label: 'Compressor',
        columns: 3,
        controls: [
            knob('compAmount', 'Amount', { min: 0, max: 1 }),
            knob('compRatio', 'Ratio', { scalingType: 'logarithmic', minValue: 1.5, maxValue: 20, resetValue: 4, unit: 'decimal' }),
            knob('compAttack', 'Attack', { scalingType: 'logarithmic', minValue: 0.001, maxValue: 0.2, resetValue: 0.01, unit: 's' }),
            knob('compRelease', 'Release', { scalingType: 'logarithmic', minValue: 0.03, maxValue: 1, resetValue: 0.25, unit: 's' }),
            knob('compOutput', 'Output', { type: 'B', modifier: 12, resetValue: 0, unit: 'dB' }),
        ],
    },
    {
        label: 'Chorus',
        columns: 2,
        controls: [
            knob('chorusRate', 'Rate', { scalingType: 'logarithmic', minValue: 0.05, maxValue: 5, resetValue: 0.6, unit: 'Hz' }),
            knob('chorusDepth', 'Depth', { min: 0, max: 0.008, resetValue: 0.002, unit: 's' }),
            knob('chorusFeedback', 'Feedback', { min: 0, max: 0.6 }),
            knob('chorusAmount', DRY_WET),
        ],
    },
    {
        label: 'Flanger',
        columns: 3,
        controls: [
            knob('flangerRate', 'Rate', { scalingType: 'logarithmic', minValue: 0.02, maxValue: 2, resetValue: 0.15, unit: 'Hz' }),
            knob('flangerDepth', 'Depth', { min: 0, max: 0.005, resetValue: 0.002, unit: 's' }),
            knob('flangerDelay', 'Delay', { min: 0.001, max: 0.012, resetValue: 0.004, unit: 's' }),
            knob('flangerFeedback', 'Feedback', { min: 0, max: 0.85, resetValue: 0.3 }),
            knob('flangerAmount', DRY_WET),
        ],
    },
    {
        label: 'Phaser',
        columns: 3,
        controls: [
            knob('phaserRate', 'Rate', { scalingType: 'logarithmic', minValue: 0.02, maxValue: 5, resetValue: 0.5, unit: 'Hz' }),
            knob('phaserDepth', 'Sweep', { min: 0, max: 1000, resetValue: 600, isRounded: true, unit: 'Hz' }),
            knob('phaserFrequency', 'Centre', { scalingType: 'logarithmic', minValue: 200, maxValue: 4000, resetValue: 800, isRounded: true }),
            knob('phaserFeedback', 'Feedback', { min: 0, max: 0.75, resetValue: 0.3 }),
            knob('phaserAmount', DRY_WET),
        ],
    },
    {
        label: 'Tremolo / Auto-pan',
        columns: 4,
        controls: [
            knob('tremoloRate', 'Trem rate', { scalingType: 'logarithmic', minValue: 0.05, maxValue: 12, resetValue: 4, unit: 'Hz' }),
            knob('tremoloDepth', 'Trem depth', { resetValue: 0 }),
            knob('autoPanRate', 'Pan rate', { scalingType: 'logarithmic', minValue: 0.02, maxValue: 5, resetValue: 0.2, unit: 'Hz' }),
            knob('autoPanDepth', 'Pan depth', { resetValue: 0 }),
        ],
    },
    {
        label: 'Delay',
        columns: 2,
        controls: [
            knob('delayTime', 'Time', { min: 0.02, max: 1, resetValue: 0.375 }),
            knob('delayFeedback', 'Feedback', { min: 0, max: 0.9, resetValue: 0.3 }),
            knob('delayTone', 'Tone', { scalingType: 'logarithmic', minValue: 500, maxValue: 12000, resetValue: 4400, isRounded: true }),
            knob('delayAmount', DRY_WET),
        ],
    },
    {
        label: 'Ping Pong Delay',
        columns: 2,
        controls: [
            knob('pingPongDelayTime', 'Time', { min: 0.02, max: 1, resetValue: 0.375 }),
            knob('pingPongFeedback', 'Feedback', { min: 0, max: 0.9, resetValue: 0.3 }),
            knob('pingPongTone', 'Tone', { scalingType: 'logarithmic', minValue: 500, maxValue: 12000, resetValue: 4400, isRounded: true }),
            knob('pingPongAmount', DRY_WET),
        ],
    },
    {
        label: 'Reverb',
        columns: 2,
        controls: [
            // a sampled room (Type) on the Web Audio voices, a room network (Size) on the Wasm ones
            select('reverbType', 'Type', REVERB, (p, context) => context?.engine === 'wasm'),
            knob('reverbDecay', 'Decay', { scalingType: 'logarithmic', minValue: 0.3, maxValue: 20, resetValue: 8, unit: 's' }),
            knob('reverbSize', 'Size', { min: 0.2, max: 1, resetValue: 0.7 }, (p, context) => context?.engine !== 'wasm'),
            knob('reverbDamping', 'Damping', { scalingType: 'logarithmic', minValue: 1000, maxValue: 16000, resetValue: 6000, isRounded: true, unit: 'Hz' }),
            knob('reverbPredelay', 'Pre-delay', { min: 0, max: 0.15, resetValue: 0.025, unit: 's' }),
            knob('reverbAmount', DRY_WET),
        ],
    },
    {
        label: 'Shimmer',
        columns: 3,
        controls: [
            knob('shimmerDecay', 'Decay', { scalingType: 'logarithmic', minValue: 1, maxValue: 20, resetValue: 6, unit: 's' }),
            { kind: 'choice', key: 'shimmerInterval', label: 'Interval', options: { fifth: 'Fifth', octave: 'Octave', twelfth: '12th', twoOctaves: '2 oct' } },
            knob('shimmerClimb', 'Climb', { min: 0, max: 0.9, resetValue: 0.5 }),
            knob('shimmerTone', 'Tone', { scalingType: 'logarithmic', minValue: 2000, maxValue: 16000, resetValue: 7000, isRounded: true }),
            knob('shimmerMix', DRY_WET),
        ],
    },
    {
        label: 'Freeze',
        columns: 3,
        controls: [
            toggle('freezeHold', 'Hold'),
            knob('freezeLength', 'Length', { min: 0.25, max: 4, resetValue: 2, unit: 's' }),
            knob('freezeFade', 'Fade', { scalingType: 'logarithmic', minValue: 0.05, maxValue: 4, resetValue: 1, unit: 's' }),
            knob('freezeMix', DRY_WET),
        ],
    },
    {
        label: 'Master Filter',
        columns: 2,
        controls: [
            select('masterFilterType', 'Type', FILTER),
            knob('masterFilterFreq', 'Cutoff', { scalingType: 'logarithmic', minValue: 20, maxValue: 11020, resetValue: 11000, isRounded: true }),
            knob('masterFilterQ', 'Q', { modifier: 20 }),
            knob('masterFilterGain', 'Gain', { type: 'B', modifier: 40 }),
        ],
    },
    {
        label: 'Master Limiter',
        columns: 3,
        controls: [
            knob('masterLimiterThreshold', 'Threshold', { type: 'B', modifier: 48, offset: -24, resetValue: -6, decimalPlaces: 1 }),
            knob('masterLimiterRatio', 'Ratio', { modifier: 19, offset: 1, resetValue: 20, isRounded: true }),
            knob('masterLimiterKnee', 'Knee', { modifier: 40, resetValue: 0, decimalPlaces: 1 }),
            knob('masterLimiterAttack', 'Attack', { scalingType: 'logarithmic', minValue: 0.0001, maxValue: 1, resetValue: 0.005, decimalPlaces: 4 }),
            knob('masterLimiterRelease', 'Release', { scalingType: 'logarithmic', minValue: 0.001, maxValue: 3, resetValue: 0.05, decimalPlaces: 3 }),
            knob('masterVolume', 'Volume'),
        ],
    },
    {
        label: 'Microtonal',
        columns: 7,
        controls: [
            pitchKnob('pitchC', 'C'),
            pitchKnob('pitchCSharp', 'C#'),
            pitchKnob('pitchD', 'D'),
            pitchKnob('pitchDSharp', 'D#'),
            pitchKnob('pitchE', 'E'),
            pitchKnob('pitchF', 'F'),
            pitchKnob('pitchFSharp', 'F#'),
            pitchKnob('pitchG', 'G'),
            pitchKnob('pitchGSharp', 'G#'),
            pitchKnob('pitchA', 'A'),
            pitchKnob('pitchASharp', 'A#'),
            pitchKnob('pitchB', 'B'),
            knob('octaveRatio', 'Octave Ratio', { modifier: 2.0, offset: 1.0, resetValue: 2.0, decimalPlaces: 3 }),
            pitchKnob('allThemPitches', 'All'),
        ],
    },
];

export default SYNTH_SCHEMA;
