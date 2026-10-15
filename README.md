# bgm

Calm procedural background music in the browser - for under a video, a
podcast or a work session. Live at **[liz.moe/bgm](https://liz.moe/bgm/)**.

Three synth voices - **rhythm/pad**, **bass/support** and **lead** - play
from scales, chord progressions and simple arrangement rules, and can slowly
drift: key, mode, progression and tempo change over time with configurable
chances, either centred on your settings or wandering freely. Everything is
synthesised with the Web Audio API; there are no samples.

## Features

- Every scale and mode family (major modes, harmonic/melodic minor,
  harmonic major, double harmonic, Neapolitan, hexatonic, pentatonic), any
  key, with correctly spelled chord names and Roman numerals
- Progressions of 2 to 8 chords; triads, sevenths or ninths; 3/4, 4/4,
  5/4, 6/8 and 7/4
- Arrangement: pad styles (sustain / pulse / slow arpeggio) and bass styles
  (whole bar / per beat group / walking) by adjustable shares, a lead that
  plays call-and-response phrases, per-voice octave and octave wander,
  humanized timing, velocity and pitch
- Drift ("evolution"): related-key and mode changes, progression changes,
  tempo glides, optional V-chord preparation for key changes; keys and
  modes can be excluded
- A scrolling timeline of the chords and notes coming up, with mute / solo
  per voice
- Play any voice from the computer keyboard (A-; and W E T Y U O P, Z/X for
  octave) or from MIDI after clicking "Connect MIDI"
- A full synth editor per voice, 41 built-in presets by category, and your
  own presets (saved in the browser, or exported/imported as JSON)
- Procedural sounds: a new preset per voice from a random seed, shaped for
  the role and levelled to its default's loudness; links carry the seed
- Stop fades out within half a second, reverb and echo tails included
- Randomize key & scale, progression, conductor, voices or everything at
  once - "within reason" (near the defaults, minor progressions in minor
  modes, lead sounds on the lead) or "full random"
- Share links: the address bar always holds the current settings, the
  presets per voice (built-in or generated) and a random seed in a short code (`?s=FWfOUc`
  for defaults, ~30 characters fully randomized), so a link plays the same
  piece for whoever opens it
- An audio-thread load meter with a choice of output buffer size (larger
  buffers stop crackling on slow machines), and a light / dark / system
  theme toggle

## Development

```bash
npm install
npm run dev       # http://localhost:5173/bgm/
npm test          # Vitest
npm run build     # -> dist/
npm run preview   # serve dist/ at http://localhost:4173/bgm/
npm run deploy    # tests + build, then publish dist/ to the gh-pages branch
```

Audio performance: with `npm run dev` running, open
http://localhost:5173/bgm/bench/ (engine load per arrangement, parameters in
`bench/bench.js`) or `/bgm/bench/nodes.html` (cost per node type); results
and history are in `docs/DESIGN.md` §5.

The site is a GitHub Pages project site, so it is built with `base: '/bgm/'`
(see `vite.config.js`); asset and AudioWorklet URLs go through
`import.meta.env.BASE_URL`.

## Layout

```
src/app/            the application
  Generator.js        plan-ahead sequencer: settings -> planned bars -> audio
  conductor.js        drift of key / mode / progression / tempo per cycle
  arranger.js         per-bar notes for pad, bass and lead
  theory.js           scales, chords, spelling, voice leading
  engine/             Instrument (voices + effects), envelopes, Transport
  editor/             synth editor, presets store
  settings.js         defaults, validation, share links
src/nodes/          Web Audio building blocks (effects, oscillators, noise)
src/components/     MonoSynth voice and the knob/select/module UI controls
public/             AudioWorklet processors (noise, bitcrusher)
bench/              audio performance benchmark pages (dev server only)
docs/DESIGN.md      design notes, decisions and performance measurements
```

Unit tests live next to the code (`*.test.js`) and cover the music logic -
theory, arrangement rules across meters and scales, drift, planning and
booking, settings/share-link validation.
