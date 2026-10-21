# Public hardware-comparison pages

The deployed `/synths/` hub and all fourteen instrument pages are included in
`npm run build:public`. They load the curated YAML files in
`public/synth-presets/`: 24 banks, 896 programs. Each synth's own sounds ("bgm sounds"), which now include the sounds approximated from printed patch books and sheets (Pluto 8, Oberon Xa, Oracle 5, Analog 106), renamed and sorted into each synth's categories. The only factory comparison banks left are the FM7 ROM cartridges and the VectorVS programs, until generated suites replace them; those files are deployed from the local machine and kept out of the repository. The existing main app and labs
remain available at their usual addresses.

The hub groups instruments into **Vintage**, **DIY** and **Drums**. DIY Poly at
`/synths/poly/` wraps the existing subtractive Wasm backend, including all four
architectures and both layers. DIY FM at `/synths/fm/` wraps the existing four-
and six-operator FM backend, with operator envelopes and editable forward
routing. They use the existing insert and FDN effects kernels and retain all
22 original lab recipes. Tone, Motion, Colour and Advanced sections
share MIDI, keyboard, ribbon, pressure pad, saved sounds and scope controls.
The scope taps the actual stereo output after effects without altering it.

Every instrument now has an **Effects** button, opening the shared outboard rack
without restarting its audio. All controls are on one scrolling page, with
illustrated saturation, EQ, phaser, flanger, chorus, compressor, delay, reverb
and output blocks. Each effect has its own switch; rack bypass and clear-tail
controls are separate. Drag sliders for immediate changes, or type a number
and press Enter (or leave the field) to apply it.

**Open in a tab** opens `/synths/effects/` beside the instrument. Its connection
selector discovers open synth tabs in the same browser profile and origin.
Only the selected session receives edits, including when two tabs play the
same synth. Audio remains in the source tab; held MIDI notes continue when
switching to the rack. Computer keys play in the synth tab or its built-in
Effects view. The hub also links directly to the effects page.

DIY recipes retain their original insert and room settings. Vintage and drum
presets gain neutral external outboard; their existing space controls move to
the rack's **Instrument space** block. The poly engine's built-in chorus is
also there. Native preset effects remain part of the sound. Rack bypass
controls the external chain. The compressor starts off, uses automatic level
compensation, and provides an additional output trim; this follows the existing
native compressor and [Web Audio's makeup-gain behaviour](https://www.w3.org/TR/webaudio-1.0/#computing-the-makeup-gain).

Rack settings persist per instrument and are included in **Save sound**. Rack
edits clear the exact-program comparison link. Loading a comparison program
restores its native effects and neutral outboard extras; downloadable bank YAML
continues to describe that original program, rather than a separately edited
outboard chain.

On any instrument, tap to start, then use **Compare presets** to choose a bank
and program. **Copy comparison link** opens that same bank/program on another
device, taking precedence over a previously saved patch. **Download YAML** gives
the entire selected bank, including panel settings and exact engine values.
Editing a sound clears its exact-program link; **Reload program** restores it.

Examples after publishing:

- `/synths/juno/?bank=juno-factory&program=A11`
- `/synths/prophet5/?bank=prophet5-factory&program=F5-11`
- `/synths/jupiter8/?bank=jupiter8-factory&program=31`
- `/synths/obxa/?bank=obxa-factory&program=A1`
- `/synths/dx7/?bank=dx7-rom1a&program=11`
- `/synths/vs/?bank=vs-factory&program=0`
- `/synths/poly/?bank=poly-originals&program=3`
- `/synths/fm/?bank=fm-originals&program=3`

The comparison links select instrument parameters. Drum/bass sequencer pattern
edits and performance settings are still per-device; they are not encoded in
these program links. Use the same note, velocity, gate duration and controller
positions when comparing with hardware.

The YAML `panel` section contains original-program settings, with analogue
knobs shown on a 0-10 scale, and digital parameters in their display units.
The `values` section uses this engine's parameter names and units; these are
what the web synth actually loads, with no rounding through the panel values.
Some unit conversions and filter responses remain estimates. `bgm sounds` banks
are original recipes, not original hardware factory programs. The OB-Xa book
is transcribed from drawings and lacks group C. The Prophet export now uses
127, rather than the obsolete 120 endpoint, for panel knob positions.

VS factory and cartridge YAML include their bank-specific composed wave arrays.
This avoids substituting the built-in wave recipes when loading a shared
factory-program link. Source SysEx, tape WAVs, sample packs and unrelated
`banks/` files are not copied to the public build.

To regenerate the public banks on a machine with the local source files:

```sh
npm run synths:presets
```

`tools/buildSynthPresets.mjs` names every published source explicitly; it never
scans the raw bank or reference directories. The generated YAML is tracked so
a checkout can build/deploy without those source files. Ordinary local builds
still offer the private import shelves separately; a public preview does not
serve the raw `/local-banks/` middleware.

Validation:

```sh
npm test
npm run build:public
npx vite preview --mode public --host 127.0.0.1 --port 5187
node tools/auditSynthPublic.mjs
node tools/auditDiySynths.mjs
node tools/auditSynthRack.mjs
node tools/auditDrumLibrary.mjs
```

The browser audit checks all fourteen deep links, exact loaded parameters, actual
worklet voice activity, YAML downloads, copied links, edit/reload behaviour and
phone layout. `tools/checkPublicBuild.mjs` requires every synth page, its engine
and the declared YAML banks, and rejects raw banks and reference recordings.
The DIY audit also checks layer isolation, custom FM routing, post-effects audio,
audio restart and 40 layouts across five viewport sizes and four panel sections.
The rack audit checks real sine audio through clean/bypass/compression, delayed
impulses and tail clearing, remote edits and source isolation, MIDI note holds,
numeric entry, preset restoration, disconnects and desktop/phone layouts with
the scope open and closed.
The three drum machines offer 32 loops and 12 arrangements of 4, 8 or 16 bars.
Each also offers a **Deep** sound preserving the original bass drum, alongside
the shorter, dry **Classic** reference sound. The **Kick body** selector works
independently of the rest of the kit. Existing saved patches and drum share links
retain the original Deep body. See the [drum comparison](SYNTHS_DRUM_COMPARISON.md)
for measurements and remaining accuracy gaps.
The subsequent [kit voicing pass](SYNTHS_DRUM_VOICING.md) tunes snares, toms,
metal voices and kit balance against 29 targets, with sample-rate regression
checks. Deep preserves the original kick while the rest of its kit receives
the revised voicing.
Beats load into the selected pattern and disable its chain, keeping playback
running at its current step. Arrangements replace
A–H and stop transport so the next Play begins at the first stage. Missing
percussion voices map to available instruments on smaller kits. During arrangement
playback, the grid and selected A–H button follow the actual engine pattern without
queuing a selection command or changing the chain.
“Share drums” copies a versioned URL containing all eight patterns, lengths,
per-pattern tempos, chain, selection, global tempo/swing, drum parameters and
outboard settings. Version 2 drops default metadata and trailing empty cells,
uses native parameter IDs and compresses the snapshot; existing version 1 links
still load and produce compact links when re-shared. Decompression has a fixed
size limit. Links override saved state without autoplay; edits detach the
old link, and clipboard denial reveals a selectable URL. Invalid links leave the
saved setup available and display an error. The drum audit checks fresh-browser
restoration with conflicting saved state, actual worklet playback and 15 layouts.
The effects rack now has 14 complete recipes; its audit passes a sine through
every preset as well as testing compression, echoes and linked controls.
The rack uses the full available width, with five columns above 2,200 CSS pixels
and compact control/value pairs. Its layout audit includes 3,837×1,747,
3,440×1,440, 3,035×1,125 and 2,560×1,080 viewports, checks slider widths and
unused side margins, and requires every block to fit without panel scrolling
at the two largest sizes with both scope and keyboard visible. Shorter windows
keep the panel scrollable so the bottom controls remain reachable.

The VS panel uses content-sized responsive sections and a scrolling parameter
area. Its envelope rates/levels are grouped, loop modes use dropdowns, and matrix
amounts use horizontal sliders. `node tools/auditVsLayout.mjs` checks seven
viewport sizes with the scope both open and closed, group/control containment,
bottom-of-panel reachability, loop/amount edits and audio playback.

The spectrum plot's former narrow comb was a display resampling error: crossing
an FFT-bin boundary switched even sub-bin-wide pixels to max pooling. It could
draw extra spikes from a mathematically pure sine. Sub-bin pixels now always
interpolate; wider pixels retain real peaks. Peak hold also starts fresh when
enabled. The FFT and synth signal generation are unchanged by this correction.
