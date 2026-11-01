/** The melodic style (melodicStyle.js) that suits a preset's settings. No imports, so the tools can use it under plain node. */
export function suitedStyle(settings) {
    const { leadDensity = 0, leadSyncopation = 0, swing = 0, bassWeights: bass = {}, padWeights: pad = {} } = settings;
    if (settings.sequencer?.lanes || (bass.drive ?? 0) > (bass.whole ?? 0) + (bass.half ?? 0)) return leadDensity >= .5 ? 'riff' : 'hook';
    if (leadDensity >= .5) return 'game';
    if (swing >= .2 || leadSyncopation >= .2) return 'lounge';
    if ((pad.sustain ?? 0) >= 50 && leadDensity < .25) return 'cinema';
    return 'song';
}
