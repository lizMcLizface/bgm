// The instruments of the University of Iowa Musical Instrument Samples that /synths/iowa plays. `folder` is banks/iowa/<folder>,
// `match` picks that patch's files inside it, `decay` is a struck or plucked note (partials that die away) rather than a held one.
// ring: lets a struck note ring on after the key comes up.
// uses: plays another patch's table, here with roll: a held key repeats the strike at the rate measured from that table's rollFiles (rollId names their A/B folder).
// even: every take played differently (a double bass on quiet strings), so each note's measurements become the median of the notes around it, and its level their level.
// soften: { from, perOctave }: takes dB off the harmonics and noise above `from` Hz. The violin recordings are about 20 dB brighter above 4 kHz than the viola's, and in a chord all of it adds up.
// glide: how far the voice glides between notes by itself, 0..1 as settings.portamento (composition/portamento.js).
// source 'vsco': VSCO 2 Community Edition (CC0), banks/vsco/<folder>, one note per file, for what the Iowa set does not have.
export const FAMILIES = ['Flutes', 'Reeds', 'Saxophones', 'Brass', 'Bowed', 'Plucked', 'Mallets'];
export const PATCHES = [
    { id: 'flute', name: 'Flute', family: 'Flutes', folder: 'flute', match: /\.vib\./i, glide: .35 },
    { id: 'flute-straight', name: 'Flute, no vibrato', family: 'Flutes', folder: 'flute', match: /\.nonvib\./i, glide: .35 },
    { id: 'alto-flute', name: 'Alto Flute', family: 'Flutes', folder: 'alto-flute', glide: .35 },
    { id: 'bass-flute', name: 'Bass Flute', family: 'Flutes', folder: 'bass-flute', glide: .35 },
    { id: 'piccolo', name: 'Piccolo', family: 'Flutes', source: 'vsco', folder: 'Woodwinds/Piccolo/Sus', glide: .35 },
    { id: 'oboe', name: 'Oboe', family: 'Reeds', folder: 'oboe' },
    { id: 'eb-clarinet', name: 'E♭ Clarinet', family: 'Reeds', folder: 'eb-clarinet' },
    { id: 'bb-clarinet', name: 'B♭ Clarinet', family: 'Reeds', folder: 'bb-clarinet' },
    { id: 'bass-clarinet', name: 'Bass Clarinet', family: 'Reeds', folder: 'bass-clarinet' },
    { id: 'bassoon', name: 'Bassoon', family: 'Reeds', folder: 'bassoon' },
    { id: 'soprano-sax', name: 'Soprano Sax', family: 'Saxophones', folder: 'soprano-sax', match: /\.vib\./i },
    { id: 'soprano-sax-straight', name: 'Soprano Sax, no vibrato', family: 'Saxophones', folder: 'soprano-sax', match: /\.novib\./i },
    { id: 'alto-sax', name: 'Alto Sax', family: 'Saxophones', folder: 'alto-sax', match: /\.vib\./i },
    { id: 'alto-sax-straight', name: 'Alto Sax, no vibrato', family: 'Saxophones', folder: 'alto-sax', match: /\.novib\./i },
    { id: 'horn', name: 'French Horn', family: 'Brass', folder: 'horn' },
    { id: 'trumpet', name: 'Trumpet', family: 'Brass', folder: 'trumpet', match: /\.vib\./i },
    { id: 'trumpet-straight', name: 'Trumpet, no vibrato', family: 'Brass', folder: 'trumpet', match: /\.novib\./i },
    { id: 'trumpet-harmon', name: 'Trumpet, harmon mute', family: 'Brass', source: 'vsco', folder: 'Brass/Trumpet/harmonM-sus' },
    { id: 'trumpet-straight-mute', name: 'Trumpet, straight mute', family: 'Brass', source: 'vsco', folder: 'Brass/Trumpet/straightM-sus' },
    { id: 'horn-mute', name: 'French Horn, muted', family: 'Brass', source: 'vsco', folder: 'Brass/F Horn/mute' },
    { id: 'tenor-trombone', name: 'Tenor Trombone', family: 'Brass', folder: 'tenor-trombone' },
    { id: 'bass-trombone', name: 'Bass Trombone', family: 'Brass', folder: 'bass-trombone' },
    { id: 'tuba', name: 'Tuba', family: 'Brass', folder: 'tuba' },
    { id: 'violin', name: 'Violin', family: 'Bowed', folder: 'violin', match: /\.arco\./i, soften: { from: 2000, perOctave: 8 } },
    { id: 'viola', name: 'Viola', family: 'Bowed', folder: 'viola', match: /\.arco\./i },
    { id: 'cello', name: 'Cello', family: 'Bowed', folder: 'cello', match: /\.arco\./i },
    { id: 'double-bass', name: 'Double Bass', family: 'Bowed', folder: 'double-bass', match: /\.arco\./i, even: true },
    { id: 'bowed-vibes', name: 'Bowed Vibraphone', family: 'Bowed', folder: 'vibraphone', match: /\.bow\./i },
    { id: 'violin-pizz', name: 'Violin Pizzicato', family: 'Plucked', folder: 'violin', match: /\.pizz\./i, decay: true },
    { id: 'viola-pizz', name: 'Viola Pizzicato', family: 'Plucked', folder: 'viola', match: /\.pizz\./i, decay: true },
    { id: 'cello-pizz', name: 'Cello Pizzicato', family: 'Plucked', folder: 'cello', match: /\.pizz\./i, decay: true },
    { id: 'double-bass-pizz', name: 'Double Bass Pizzicato', family: 'Plucked', folder: 'double-bass', match: /\.pizz\./i, decay: true },
    { id: 'guitar', name: 'Guitar', family: 'Plucked', folder: 'guitar', match: /\.mono\./i, decay: true },
    { id: 'harp', name: 'Harp', family: 'Plucked', source: 'vsco', folder: 'Strings/Harp', decay: true, ring: true },
    { id: 'marimba', name: 'Marimba, yarn', family: 'Mallets', folder: 'marimba', match: /\.yarn\./i, decay: true, ring: true, rollFiles: /^Marimba\.roll\./i, rollId: 'marimba-roll' },
    { id: 'marimba-roll', name: 'Marimba, roll', family: 'Mallets', uses: 'marimba', roll: true, decay: true, ring: true },
    { id: 'marimba-rubber', name: 'Marimba, rubber', family: 'Mallets', folder: 'marimba', match: /\.rubber\./i, decay: true, ring: true },
    { id: 'xylophone', name: 'Xylophone, hard rubber', family: 'Mallets', folder: 'xylophone', match: /\.hardrubber\.(pp|mf|ff)\./i, decay: true, ring: true, rollFiles: /\.hardrubber\.roll\./i, rollId: 'xylophone-roll' },
    { id: 'xylophone-roll', name: 'Xylophone, hard rubber roll', family: 'Mallets', uses: 'xylophone', roll: true, decay: true, ring: true },
    { id: 'xylophone-rosewood', name: 'Xylophone, rosewood', family: 'Mallets', folder: 'xylophone', match: /\.rosewood\.(pp|mf|ff)\./i, decay: true, ring: true, rollFiles: /\.rosewood\.roll\./i, rollId: 'xylophone-rosewood-roll' },
    { id: 'xylophone-rosewood-roll', name: 'Xylophone, rosewood roll', family: 'Mallets', uses: 'xylophone-rosewood', roll: true, decay: true, ring: true },
    { id: 'vibraphone', name: 'Vibraphone', family: 'Mallets', folder: 'vibraphone', match: /\.sustain\./i, decay: true, ring: true },
    { id: 'bells', name: 'Orchestra Bells, plastic', family: 'Mallets', folder: 'bells', match: /\.plastic\./i, decay: true, ring: true },
    { id: 'bells-brass', name: 'Orchestra Bells, brass', family: 'Mallets', folder: 'bells', match: /\.brass\./i, decay: true, ring: true },
    { id: 'crotales', name: 'Crotales', family: 'Mallets', folder: 'crotales', decay: true, ring: true },
];
export const LAYERS = [['pp', 30], ['mf', 80], ['ff', 118]];    // dynamic marking, the velocity it stands for
