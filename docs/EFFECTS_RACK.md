# Effects rack

The rack (`src/synths/effects`) is one audio chain per instrument (`graph.js`), edited by two UIs that share their parts
(`rackParts.jsx`): the full-page `RackPanel` (chain and levels left, the selected effect right) and the touch-first
`RackCompact` (a popover with the chain and levels; tapping an effect opens its faders on a darkened layer). The drum
pages use the compact one (`SynthShell compactRack`); everything else still opens the full page.

## Order

The chain order is one number in the rack values, `master.order` (0-5039): the position of the unit order among all
permutations of seven units (`order.js`): saturation, EQ, phaser, flanger, chorus, compressor and "space". Delay and Reverb
are one unit because they share one kernel (the effects bus: delay into reverb, plus the dry signal), so they move together
(their tiles have dashed borders). The instrument is always first and the output last. Presets keep the player's order;
Reset rack restores the default.

The inserts kernel runs saturation, EQ, phaser, flanger and chorus in one fixed order, so `stagesFor` groups each run of
insert effects that is already in that order into one kernel instance (the default order is one instance, exactly as before)
and any out-of-order effect gets its own, masked to run only its effects (`graph.js`). Instances are created on demand; the
rack is muted for ~25 ms while the links change. The main app's engines build their racks through the same `createRack`, so
they follow the order too; the offline previews of the DIY synths (`diySource.js`) still render in the default order.

## Stereo

Every link is two channels, explicit. The phaser, flanger and chorus offset their left and right modulation, so a mono source
leaves them wide, and each later effect treats the two sides separately (saturation and EQ are per channel). The compressor is
a Web Audio DynamicsCompressorNode, which links the channels: after the modulation effects it reacts to the combined level,
before them it sees the mono signal. The space unit is stereo in and out (ping-pong and width work on the two sides); the dry
signal travels through it, so effects after it process dry plus echoes and reverb. Delay and reverb are sends inside that unit,
not separable.

## Adding and removing effects

The chain shows only the units in it. `master.chain` is a bitmask over the fourteen units (`order.js`); the original seven are in
by default, the rest are added from the "Add effect" menu and land beside the effect they usually follow (filter and pitch before
saturation, crusher after it, ring after EQ, tremolo after chorus, width after the compressor, limiter last). A removed unit is not
wired and does not run; its settings are kept. A preset keeps the player's order and chain and adds any unit it uses.

Added units (`extras.js`) are Web Audio stages, all stereo: Filter (low and high cut, 12 or 24 dB), Tremolo (with stereo spread, so
it can auto-pan), Bit crusher and Pitch shifter (two small worklets in `public/rack-fx-processor.js`; the shifter is a dual-tap
delay-line shifter with about 25 ms of latency, the dry signal undelayed), Ring modulator, Stereo width (mid/side; 0 is mono, so it
doubles as a mono-compatibility check) and Limiter. Also new: compressor Mix (parallel compression), early reflections shown in the
reverb, and a delay Sync menu (note lengths at the instrument's tempo; only where the instrument has a tempo, the drum machines).

Not done: reverb types, a sidechain filter on the compressor, delay feedback low-cut and ducking, stereo spread on the phaser,
flanger and chorus (kernel changes), and amp simulation (left out on purpose).

## Kernel additions (the Rust side)

Appended parameters, with defaults that leave the earlier sound bit for bit as it was (the existing kernel tests pin this):

- Inserts kernel (`synth-engine/inserts`, parameters 24-28): phaser, flanger and chorus **spread** (the left/right LFO offset in
  cycles, 0 to 0.5; 0.25, 0.5 and 0.5 are the old fixed values; 0 makes the sides identical), chorus **feedback**, phaser **stages**
  (2-12; 6 is the old fixed count).
- Effects kernel (`synth-engine/effects`, parameters 18-20): echo **low cut** in the feedback (Hz, 0 off, a one-pole high-pass),
  echo **ducking** (the echo output, not its feedback, is lowered while the dry input is loud: 4 ms attack, 250 ms release), and
  reverb **type** (classic, room, hall, plate): a set of five values per type (diffuser coefficient, early-reflection level,
  delay-line scale, modulation scale, high-frequency decay ratio). The types are starting points set by reasoning, not by ear.

`npm run synth:build` rebuilds every kernel; `node tools/buildSynth.mjs --only=effects,inserts` rebuilds just these two. The
parameter tables in `insertsConfig.js` and `effectsConfig.js` must keep the kernels' order (new entries are appended).
`src/synth-lab/rackEngine.test.js` checks each new control (spread 0 is mono, stage counts differ, the low cut thins repeats, ducking
lowers the echo, the types differ and the plate has no early reflections).

Offline renders (the loudness and level measurements in the main app, the synth-lab benchmarks) use the kernels directly, so they do not
include the Web Audio units (filter, tremolo, crusher, ring, pitch, width, limiter, the compressor) or a non-default chain order. These
are measurement tools, not exports; nothing user-facing renders offline.
