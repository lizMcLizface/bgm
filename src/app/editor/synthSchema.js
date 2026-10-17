// The synth editor's panel as data: modules of controls, each bound to one
// preset key. Knob props (modifier/offset/scaling/...) are copied from
// PolySynth.jsx's panel so every control behaves as it does in unCAGED's
// synth tab. Left out on purpose: polyphony (fixed per role by the
// generator), arpeggiator/progression/chord capture (the generator plays),
// spectrum views and theme picker.

import { WAVEFORM, FILTER, REVERB, ENVELOPE_SHAPE, NOISE } from '../../util/util';

const knob = (key, label, props = {}, disabled) => ({ kind: 'knob', key, label, props, disabled });
const select = (key, label, options, disabled) => ({ kind: 'select', key, label, options, disabled });
const toggle = (key, label) => ({ kind: 'toggle', key, label });

const osc2Off = (p) => p.osc2Type === 'off';
const DRY_WET = 'Dry/Wet';

const pitchKnob = (key, label) => knob(key, label, { modifier: 1.5, offset: 0.5, resetValue: 1.0, decimalPlaces: 3 });

const SYNTH_SCHEMA = [
    { label: 'Sound source', columns: 2, controls: [
        { kind: 'choice', key: 'stringModel', label: 'Source', options: { oscillator: 'Oscillator', plucked: 'Plucked string', piano: 'Piano' } },
    ] },
    { label: 'Piano', columns: 4, controls: [
        { kind: 'choice', key: 'pianoType', label: 'Piano tone', options: { felt: 'Felt', electric: 'Electric' } },
        knob('pianoDecay', 'Decay', { modifier: 4.7, offset: .3, min: .3, max: 5, resetValue: 2.5 }),
        knob('pianoSustain', 'Held body', { min: 0, max: 1, resetValue: .28 }),
        knob('pianoBrightness', 'Brightness', { min: 0, max: 1, resetValue: .45 }),
        knob('pianoHammer', 'Hammer', { min: 0, max: 1, resetValue: .3 }),
        knob('pianoUnison', 'Unison', { min: 0, max: 1, resetValue: .25 }),
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
    {
        label: 'Tremolo / Auto-pan',
        columns: 4,
        controls: [
            knob('tremoloRate', 'Trem Rate', { scalingType: 'logarithmic', minValue: 0.05, maxValue: 12, resetValue: 4, decimalPlaces: 2 }),
            knob('tremoloDepth', 'Trem Depth', { resetValue: 0 }),
            knob('autoPanRate', 'Pan Rate', { scalingType: 'logarithmic', minValue: 0.02, maxValue: 5, resetValue: 0.2, decimalPlaces: 2 }),
            knob('autoPanDepth', 'Pan Depth', { resetValue: 0 }),
        ],
    },
    {
        label: 'Drive',
        columns: 2,
        controls: [
            knob('distortionDist', 'Distortion', { modifier: 30 }),
            knob('distortionAmount', DRY_WET),
        ],
    },
    {
        label: 'Crush',
        columns: 2,
        controls: [
            knob('bitCrushDepth', 'Bit Depth', { modifier: 14, offset: 2, resetValue: 8, isRounded: true }),
            knob('bitCrushAmount', DRY_WET),
        ],
    },
    {
        label: 'Flanger',
        columns: 3,
        controls: [
            knob('flangerDelay', 'Delay', { modifier: 0.015, offset: 0.005, resetValue: 0.01, decimalPlaces: 5 }),
            knob('flangerDepth', 'Depth', { modifier: 0.005, decimalPlaces: 5 }),
            knob('flangerRate', 'Rate', { modifier: 2 }),
            knob('flangerFeedback', 'Feedback'),
            knob('flangerAmount', DRY_WET),
        ],
    },
    {
        label: 'Chorus',
        columns: 2,
        controls: [
            knob('chorusRate', 'Rate', { modifier: 5, resetValue: 0.6 }),
            knob('chorusDepth', 'Depth', { modifier: 0.01, resetValue: 0.002, decimalPlaces: 4 }),
            knob('chorusFeedback', 'Feedback'),
            knob('chorusAmount', DRY_WET),
        ],
    },
    {
        label: 'Phaser',
        columns: 3,
        controls: [
            knob('phaserRate', 'Rate', { modifier: 5, resetValue: 0.5 }),
            knob('phaserDepth', 'Depth', { modifier: 1000, resetValue: 800, isRounded: true }),
            knob('phaserFrequency', 'Frequency', { scalingType: 'logarithmic', minValue: 200, maxValue: 8000, resetValue: 800, isRounded: true }),
            knob('phaserFeedback', 'Feedback', { resetValue: 0.3 }),
            knob('phaserAmount', DRY_WET),
        ],
    },
    {
        label: 'Delay',
        columns: 2,
        controls: [
            knob('delayTime', 'Time'),
            knob('delayFeedback', 'Feedback'),
            knob('delayTone', 'Tone', { modifier: 11000, resetValue: 4400, isRounded: true }),
            knob('delayAmount', DRY_WET),
        ],
    },
    {
        label: 'Ping Pong Delay',
        columns: 2,
        controls: [
            knob('pingPongDelayTime', 'Time'),
            knob('pingPongFeedback', 'Feedback'),
            knob('pingPongTone', 'Tone', { modifier: 11000, resetValue: 4400, isRounded: true }),
            knob('pingPongAmount', DRY_WET),
        ],
    },
    {
        label: 'Reverb',
        columns: 2,
        controls: [
            select('reverbType', 'Type', REVERB),
            knob('reverbAmount', DRY_WET),
        ],
    },
    {
        label: 'EQ2',
        columns: 2,
        controls: [
            knob('eqLowGain', 'Low Gain', { type: 'B', modifier: 24 }),
            knob('eqHighGain', 'High Gain', { type: 'B', modifier: 24 }),
            knob('eqLowFreq', 'Low Freq', { modifier: 640, resetValue: 320, isRounded: true }),
            knob('eqHighFreq', 'High Freq', { modifier: 8600, offset: 2400, resetValue: 3200, isRounded: true }),
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
