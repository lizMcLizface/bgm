// Interval tables for every scale family - pure data, no imports.
//
// Split out of scaleData.js so modules that only need the tables (the
// generative page, docs/DESIGN.md §2.3) can import them without the
// cycle scaleData.js -> theory/chords.js -> scales/index.js -> fretboard,
// which only resolves when entered through scales/index.js first.
// scaleData.js re-exports everything here, so existing importers are
// unchanged.

const HeptatonicScales = {
    'Major': [
        {'name': 'Ionian', 'intervals': ['W', 'W', 'H', 'W', 'W', 'W', 'H'], 'alternativeNames': ['Ionian', 'Major']},
        {'name': 'Dorian', 'intervals': ['W', 'H', 'W', 'W', 'W', 'H', 'W'], 'alternativeNames': ['Dorian']},
        {'name': 'Phrygian', 'intervals': ['H', 'W', 'W', 'W', 'H', 'W', 'W'], 'alternativeNames': ['Phrygian']},
        {'name': 'Lydian', 'intervals':   ['W', 'W', 'W', 'H', 'W', 'W', 'H'], 'alternativeNames': ['Lydian']},
        {'name': 'Mixolydian', 'intervals': ['W', 'W', 'H', 'W', 'W', 'H', 'W'], 'alternativeNames': ['Mixolydian']},
        {'name': 'Aeolian', 'intervals': ['W', 'H', 'W', 'W', 'H', 'W', 'W'], 'alternativeNames': ['Aeolian', 'Natural Minor']},
        {'name': 'Locrian', 'intervals': ['H', 'W', 'W', 'H', 'W', 'W', 'W'], 'alternativeNames': ['Locrian']}
    ],
    'Harmonic Minor':[{
        'name': 'Harmonic Minor',
        'intervals': ['W', 'H', 'W', 'W', 'H', 'A', 'H'],
        'alternativeNames': ['Harmonic Minor', 'Aeolian ♮7']
    }, {
        'name': 'Locrian ♮6',
        'intervals': ['H', 'W', 'W', 'H', 'A', 'H', 'W'],
        'alternativeNames': ['Locrian ♮6']
    }, {
        'name': 'Ionian ♯5',
        'intervals': ['W', 'W', 'H', 'A', 'H', 'W', 'H'],
        'alternativeNames': ['Ionian ♯5', 'Augmented Major']
    },{
        'name': 'Ukrainian Dorian',
        'intervals': ['W', 'H', 'A', 'H', 'W', 'H', 'W'],
        'alternativeNames': ['Ukrainian Dorian', 'Dorian #11', 'Dorian #4', 'Romanian Minor', 'Arabic Nikriz', 'Mi Sheberakh', 'altered Dorian']
    },{
        'name': 'Phrygian Dominant',
        'intervals': ['H', 'A', 'H', 'W', 'H', 'W', 'W'],
        'alternativeNames': ['Phrygian Dominant', 'Hijaz', 'Double Harmonic Major ♭7', 'Freygish']
    },{
        'name': 'Lydian #9',
        'intervals': ['A', 'H', 'W', 'H', 'W', 'W', 'H'],
        'alternativeNames': ['Lydian #9']
    },{
        'name': 'Super-Locrian scale 𝄫7',
        'intervals': ['H', 'W', 'H', 'W', 'W', 'H', 'A'],
        'alternativeNames': ['Super-Locrian scale 𝄫7', 'altered diminished', 'Ultralocian']
    }],
    'Harmonic Major': [
    {
        'name': 'Harmonic Major',
        'alternativeNames': ['Harmonic Major'],
        'intervals': ['W', 'W', 'H', 'W', 'H', 'A', 'H']
    },
    {
        'name': 'Locrian ♮2 ♮6',
        'alternativeNames': ['Locrian ♮2 ♮6', 'Dorian ♭5'],
        'intervals': ['W', 'H', 'W', 'H', 'A', 'H', 'W']
    },
    {
        'name': 'Altered Dominant ♮5',
        'alternativeNames': ['Altered Dominant ♮5', 'Phrygian ♭4'],
        'intervals': ['H', 'W', 'H', 'A', 'H', 'W', 'W']
    },
    {
        'name': 'Jazz Minor ♯4',
        'alternativeNames': ['Jazz Minor ♯4', 'Lydian ♭3'],
        'intervals': ['W', 'H', 'A', 'H', 'W', 'W', 'H']
    },
    {
        'name': 'Mixolydian ♭2',
        'alternativeNames': ['Mixolydian ♭2'],
        'intervals': ['H', 'A', 'H', 'W', 'W', 'H', 'W']
    },
    {
        'name': 'Lydian Augmented ♯2',
        'alternativeNames': ['Lydian Augmented ♯2'],
        'intervals': ['A', 'H', 'W', 'W', 'H', 'W', 'H']
    },
    {
        'name': "Locrian 𝄫7",
        'alternativeNames': ["Locrian 𝄫7"],
        'intervals': ['H', 'W', 'W', 'H', 'W', 'H', 'A']
    }
    ],
    'Melodic Minor': [{
        'name': 'Melodic Minor',
        'intervals': ['W', 'H', 'W', 'W', 'W', 'W', 'H'],
        'alternativeNames': ['Melodic Minor', 'Jazz Minor']
    }, {
        'name': 'Dorian ♭2',
        'intervals': ['H', 'W', 'W', 'W', 'W', 'H', 'W'],
        'alternativeNames': ['Dorian ♭2', 'Phrygian ♮6']
    }, {
        'name': 'Lydian Augmented',
        'intervals': ['W', 'W', 'W', 'W', 'H', 'W', 'H'],
        'alternativeNames': ['Lydian Augmented']
    },{
        'name': 'Acoustic scale',
        'intervals': ['W', 'W', 'W', 'H', 'W', 'H', 'W'],
        'alternativeNames': ['Acoustic scale', 'Lydian Dominant', 'Mixolydian ♯4', 'Overtone']
    },{
        'name': 'Aeolian dominant',
        'intervals': ['W', 'W', 'H', 'W', 'H', 'W', 'W'],
        'alternativeNames': ['Mixolydian ♭6', 'Aeolian dominant', 'Descending Melodic Minor', 'Hindu']
    }, {
        'name': 'Half Diminished',
        'intervals': ['W', 'H', 'W', 'H', 'W', 'W', 'W'],
        'alternativeNames': ['Aeolian ♭5', 'Half Diminished', 'Locrian ♮2']
    }, {
        'name': 'Altered Scale',
        'intervals': ['H', 'W', 'H', 'W', 'W', 'W', 'W'],
        'alternativeNames': ['Altered Scale', 'Super Locrian', 'Altered Dominant']
    }],
    'Double Harmonic Major':[
        {'name': 'Double Harmonic Major', 
        'intervals': ['H', 'A', 'H', 'W', 'H', 'A', 'H'],
        'alternativeNames': ['Double Harmonic Major', 'Byzantine', 'Gypsy Major', 'Arabic']
        },
        {
            'name': 'Lydian ♯2 ♯6',
            'intervals': ['A', 'H', 'W', 'H', 'A', 'H', 'H'],
            'alternativeNames': ['Lydian ♯2 ♯6']
        },
        {
            'name': 'Ultraphrygian',
            'intervals': ['H', 'W', 'H', 'A', 'H', 'H', 'A'],
            'alternativeNames': ['Ultraphrygian']
        },
        {
            'name': 'Hungarian',
            'intervals': ['W', 'H', 'A', 'H', 'H', 'A', 'H'],
            'alternativeNames': ['Hungarian', 'Gypsy Minor']
        },
        {
            'name': 'Oriental',
            'intervals': ['H', 'A', 'H', 'H', 'A', 'H', 'W'],
            'alternativeNames': ['Oriental']
        },
        {
            'name': 'Ionian ♯2 ♯5',
            'intervals': ['A', 'H', 'H', 'A', 'H', 'W', 'H'],
            'alternativeNames': ['Ionian ♯2 ♯5']
        },
        {
            'name': 'Locrian 𝄫3 𝄫7',
            'intervals': ['H', 'H', 'A', 'H', 'W', 'H', 'A'],
            'alternativeNames': ['Locrian 𝄫3 𝄫7']
        }
    ],
    'Neapolitan Major': [ {
        'name': 'Neapolitan Major',
        'intervals': ['H', 'W', 'W', 'W', 'W', 'W', 'H'],
        'alternativeNames': ['Neapolitan Major']
    },{
        'name': 'Leading Whole Tone',
        'intervals': ['W', 'W', 'W', 'W', 'W', 'H', 'H'],
        'alternativeNames': ['Leading Whole Tone', 'Lydian Augmented ♯6']
    },{
        'name': 'Lydian Augmented Dominant',
        'intervals': ['W', 'W', 'W', 'W', 'H', 'H', 'W'],
        'alternativeNames': ['Lydian Augmented Dominant']
    },{
        'name': 'Lydian Dominant ♭6',
        'intervals': ['W', 'W', 'W', 'H', 'H', 'W', 'W'],
        'alternativeNames': ['Lydian Dominant ♭6', 'Melodic Major ♯4']
    },{
        'name': 'Major Locrian',
        'intervals': ['W', 'W', 'H', 'H', 'W', 'W', 'W'],
        'alternativeNames': ['']
    },{
        'name': 'Half-Diminished ♭4',
        'intervals': ['W', 'H', 'H', 'W', 'W', 'W', 'W'],
        'alternativeNames': ['Half-Diminished ♭4', 'Altered Dominant #2']
    },{
        'name': 'Altered Dominant 𝄫3',
        'intervals': ['H', 'H', 'W', 'W', 'W', 'W', 'W'],
        'alternativeNames': ['Altered Dominant 𝄫3']
    },
    
],
    'Neapolitan Minor': [
    {
        'name': 'Neapolitan Minor',
        'intervals': ['H', 'W', 'W', 'W', 'H', 'A', 'H'],
        'alternativeNames': ['Neapolitan Minor']
    },
    {
        'name': 'Lydian ♯6',
        'intervals': ['W', 'W', 'W', 'H', 'A', 'H', 'H'],
        'alternativeNames': ['Lydian ♯6']
    },
    {
        'name': 'Mixolydian Augmented',
        'intervals': ['W', 'W', 'H', 'A', 'H', 'H', 'W'],
        'alternativeNames': ['Mixolydian Augmented']
    },
    {
        'name': 'Romani Minor',
        'intervals': ['W', 'H', 'A', 'H', 'H', 'W', 'W'],
        'alternativeNames': ['Romani Minor', 'Aeolian ♯4', 'Natural Minor ♯4']
    },
    {
        'name': 'Locrian Dominant',
        'intervals': ['H', 'A', 'H', 'H', 'W', 'W', 'W'],
        'alternativeNames': ['Locrian Dominant']
    },
    {
        'name': 'Ionian ♯2',
        'intervals': ['A', 'H', 'H', 'W', 'W', 'W', 'H'],
        'alternativeNames': ['Ionian ♯2', 'Major ♯2']
    },
    {
        'name': 'Ultralocrian 𝄫3',
        'intervals': ['H', 'H', 'W', 'W', 'W', 'H', 'A'],
        'alternativeNames': ['Ultralocrian 𝄫3', 'Altered Diminished double flat3']
    }
    
],
'Hexatonic':[
    {
        'name': 'Major Hexatonic',
        'alternativeNames': ['Major Hexatonic'],
        'intervals': ['W', 'W', 'H', 'W', 'W', 'A']
    },
    {
        'name': 'Minor Hexatonic',
        'alternativeNames': ['Minor Hexatonic'],
        'intervals': ['W', 'H', 'W', 'W', 'A', 'W']
    },
    {
        'name': "Ritsu Onkai",
        'alternativeNames': ['Ritsu Onkai'],
        'intervals': ['H', 'W', 'W', 'A', 'W', 'W']
    },
    {
        'name': 'Raga Kumud',
        'alternativeNames': ['Raga Kumud'],
        'intervals': ['W', 'W', 'A', 'W', 'H', 'W']
    },
    {
        'name': 'Mixolydian hexatonic',
        'alternativeNames': ['Mixolydian hexatonic'],
        'intervals': ['W', 'A', 'W', 'W', 'H', 'W']
    },
    {
        'name': 'Phyrgian hexatonic',
        'alternativeNames': ['Phyrgian hexatonic'],
        'intervals': ['A', 'W', 'W', 'H', 'W', 'W']
    },
    {
        'name': 'Blues',
        'alternativeNames': ['Blues'],
        'intervals': ['A', 'W', 'H', 'H', 'A', 'W']
    }
    
],
'Pentatonic':[
    {
        'name': 'Major Pentatonic',
        'alternativeNames': ['Major Pentatonic', 'gōng', 'Bhoopali', 'Mohanam', 'Mullaittīmpāṇi'],
        'intervals': ['W', 'W', 'A', 'W', 'A']
    },
    {
        'name': 'Egyptian',
        'alternativeNames': ['Egyptian', 'Suspended', 'shāng', 'Megh', 'Madhyamavati', 'Centurutti'],
        'intervals': ['W', 'A', 'W', 'A', 'W']
    },
    {
        'name': 'Blues Minor',
        'alternativeNames': ['Blues Minor', 'Man Gong', 'jué', 'Malkauns', 'Hindolam', 'Intaḷam'],
        'intervals': ['A', 'W', 'A', 'W', 'W']
    },
    {
        'name': 'Blues Major',
        'alternativeNames': ['Blues Major', 'ritsusen', 'yo', 'zhǐ', 'Durga', 'Shuddha Saveri', 'Koṉṟai'],
        'intervals': ['W', 'A', 'W', 'W', 'A']
    },
    {
        'name': 'Minor Pentatonic',
        'alternativeNames': ['Minor Pentatonic', 'yǔ', 'Dhani', 'Shuddha Dhanyāsī', 'āmpal'],
        'intervals': ['A', 'W', 'W', 'A', 'W']
    },
    {
        'name': 'Japanese',
        'alternativeNames': ['Japanese', 'Insen', 'Ryukyu'],
        'intervals': ['W', 'H', 'P', 'H', 'P']
    }
]
}

const HexatonicScales = [
    {
        'name': 'Major Hexatonic',
        'alternativeNames': ['Major Hexatonic'],
        'intervals': ['W', 'W', 'H', 'W', 'W', 'A']
    },
    {
        'name': 'Minor Hexatonic',
        'alternativeNames': ['Minor Hexatonic'],
        'intervals': ['W', 'H', 'W', 'W', 'A', 'W']
    },
    {
        'name': "Ritsu Onkai",
        'alternativeNames': ['Ritsu Onkai'],
        'intervals': ['H', 'W', 'W', 'A', 'W', 'W']
    },
    {
        'name': 'Raga Kumud',
        'alternativeNames': ['Raga Kumud'],
        'intervals': ['W', 'W', 'A', 'W', 'H', 'W']
    },
    {
        'name': 'Mixolydian hexatonic',
        'alternativeNames': ['Mixolydian hexatonic'],
        'intervals': ['W', 'A', 'W', 'W', 'H', 'W']
    },
    {
        'name': 'Phyrgian hexatonic',
        'alternativeNames': ['Phyrgian hexatonic'],
        'intervals': ['A', 'W', 'W', 'H', 'W', 'W']
    },
    {
        'name': 'Blues',
        'alternativeNames': ['Blues'],
        'intervals': ['A', 'W', 'H', 'H', 'A', 'W']
    }
    
]

const PentatonicScales = [
    {
        'name': 'Major Pentatonic',
        'alternativeNames': ['Major Pentatonic', 'gōng', 'Bhoopali', 'Mohanam', 'Mullaittīmpāṇi'],
        'intervals': ['W', 'W', 'A', 'W', 'A']
    },
    {
        'name': 'Egyptian',
        'alternativeNames': ['Egyptian', 'Suspended', 'shāng', 'Megh', 'Madhyamavati', 'Centurutti'],
        'intervals': ['W', 'A', 'W', 'A', 'W']
    },
    {
        'name': 'Blues Minor',
        'alternativeNames': ['Blues Minor', 'Man Gong', 'jué', 'Malkauns', 'Hindolam', 'Intaḷam'],
        'intervals': ['A', 'W', 'A', 'W', 'W']
    },
    {
        'name': 'Blues Major',
        'alternativeNames': ['Blues Major', 'ritsusen', 'yo', 'zhǐ', 'Durga', 'Shuddha Saveri', 'Koṉṟai'],
        'intervals': ['W', 'A', 'W', 'W', 'A']
    },
    {
        'name': 'Minor Pentatonic',
        'alternativeNames': ['Minor Pentatonic', 'yǔ', 'Dhani', 'Shuddha Dhanyāsī', 'āmpal'],
        'intervals': ['A', 'W', 'W', 'A', 'W']
    },
    {
        'name': 'Japanese',
        'alternativeNames': ['Japanese', 'Insen', 'Ryukyu'],
        'intervals': ['W', 'H', 'P', 'H', 'P']
    }
]

const scales = [
    {
        'notes': 7,
        'name': 'Heptatonic',
        'scales': HeptatonicScales
    },
    {
        'notes': 6,
        'name': 'Hexatonic',
        'scales': HexatonicScales
    },
    {
        'notes': 5,
        'name': 'Pentatonic',
        'scales': PentatonicScales
    }
]

export { HeptatonicScales, HexatonicScales, PentatonicScales, scales };
