# bgm

Calm procedural background music in the browser - for under a video, a
podcast or a work session. Live at **[calmbgm.com](https://calmbgm.com/)**.

Synth voices - **rhythm/pad**, **bass/support**, **lead** and an optional
**second lead** - play
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
- A second lead that answers the lead, harmonises it a third below, or
  plays its own slow line
- Sections: every few phrases the piece moves between intro, build, full
  and breakdown - voices come and go, the lead plays more or less
- Ambience under the music - rain, distant thunder, wind, waves, a
  fireplace, vinyl crackle - synthesised from noise (no recordings), each
  with its own level, plus a volume for the whole bed against the music.
  Each layer can be shaped - rain intensity and drop size, how often and
  how hard it thunders, wind speed and gustiness, wave length and size,
  fire crackle and roar, vinyl crackle and hiss - and placed: distance,
  pan (wind and thunder: direction) and stereo width;
  it plays with the music or on its own. "Music" and "Ambience" beside
  Play choose what Play starts (switching live while playing) and are
  part of the link; new visits play music only. Turning a layer up while
  nothing plays starts the ambience alone
- Sleep timer with a countdown: fades out over the last minute and stops
- Save audio: renders the piece to a WAV file (1-60 min) faster than real
  time, in chunks so long files stay light on memory
- Pause resumes at the next bar; randomizing or changing settings (time
  signature too) changes what comes next without starting over; ⏮ goes
  back to the start; Space plays /
  pauses; lock-screen, notification and media-key controls
  (next / previous track = new / previous variation)
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
  (optional, in the ⚙ menu with the buffer size and theme); master volume
- Simple by default: each panel shows its main controls, the rest is
  behind "More options"; a dice button randomizes a whole panel, a style
  group or a single field
- Randomize key & scale, progression, conductor, voices or everything at
  once - "within reason" (near the defaults, minor progressions in minor
  modes, lead sounds on the lead) or "full random"
- Share links: the address bar always holds the current settings in
  short codes, so a link plays the same piece for whoever opens it. A link
  has up to three parts, present only when they differ from the defaults:
  `m=` the music (with the random seed: about 6 characters for the defaults),
  `v=` the voices (sounds, volumes, registers) and `a=` the ambience.
  Older `?s=` links still open
- An audio-thread load meter with a choice of output buffer size (larger
  buffers stop crackling on slow machines), and a light / dark / system
  theme

## Development

```bash
npm install
npm run dev       # http://localhost:5173/
npm test          # Vitest
npm run build     # -> dist/
npm run preview   # serve dist/ at http://localhost:4173/
npm run deploy    # tests + build, then publish dist/ to the gh-pages branch
```

Audio performance: with `npm run dev` running, open
http://localhost:5173/bench/ (engine load per arrangement, parameters in
`bench/bench.js`) or `/bench/nodes.html` (cost per node type); results
and history are in `docs/DESIGN.md` §5.

The site is GitHub Pages (the `gh-pages` branch) on the custom domain
calmbgm.com - `public/CNAME` names it, and it ships with every deploy. It
is built with `base: '/'` (see `vite.config.js`); asset and AudioWorklet
URLs go through `import.meta.env.BASE_URL`.

## Layout

```
src/app/            the application
  Generator.js        plan-ahead sequencer: settings -> planned bars -> audio
  conductor.js        drift of key / mode / progression / tempo per cycle
  arranger.js         per-bar notes for pad, bass, lead and second lead; sections
  theory.js           scales, chords, spelling, voice leading
  engine/             Instrument (voices + effects), envelopes, Transport,
                      ambience (+ its worker), offline render to WAV
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

## Licence

The code is [MIT licensed](LICENSE). The music it makes is procedural, and
no rights are claimed on it: use anything you play, record or save however
you like. A credit (calmbgm.com) is appreciated but not required.
