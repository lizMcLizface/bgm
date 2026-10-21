# VectorVS suite: generated programs in the spirit of classic vector-synth banks

The VectorVS has no factory bank of its own. This builds one by generating programs from aggregate statistics of the original program banks, which stay local (`banks/prophet-vs/`, git-ignored), and plays them on the synth's own built-in waves.

```
npx vite-node tools/vs-suite/buildModel.mjs   # → src/synths/vs/suiteModel.json (statistics only)
npx vite-node tools/vs-suite/suite.mjs        # → src/synths/vs/suitePresets.js (100 programs)
```

1. **Model** (`model.mjs`): the 200 bank programs are grouped into families by name (names matching nothing are the VS's own "vector motion" textures) and reduced to counts of each setting, envelope and vector-path archetypes (each the average of at least three programs), and the character of the waves each oscillator picks (brightness and odd-harmonic bins), never wave numbers or wave data.
2. **Generator** (`src/synths/vs/generate.js`, ships): draws each setting, an archetype for each envelope and the vector path, and a built-in wave with the character the family tends to pick. Amp envelopes start from silence. Seeded; the page's "New" button uses it.
2b. **Tuning:** the model counts the four oscillators' coarse + fine tunings as one pattern (unison, octaves, octave and fifth …), and the generator draws a whole pattern, moved so its lowest oscillator sounds on the played note's octave. Drawn per oscillator, most programs stacked unrelated intervals (a bass on 0, 24, 0 and 19), and a whole-program offset (all four a semitone up) played out of key.
3. **Suite** (`suite.mjs`): candidates are kept when they render cleanly on the built-in waves, sound like their family (brightness, attack and sustain within the range of the family's programs, heard with their own waves; basses at C2 over the whole held note, with their fundamental weight) and sit at least as far from every bank program as two bank programs typically are from each other. Then named (`names.mjs`) and level-matched, with volume stepped down until a chord stays clear of full scale.

The page plays every built-in sound (hand-made, suite and "New") on the built-in waves, switching back to them if a bank's waves were loaded.
