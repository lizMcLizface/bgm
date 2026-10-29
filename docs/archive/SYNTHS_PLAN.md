> **Archived 2026-10-28.** Historical record of finished work; open items are tracked in [../ROADMAP.md](../ROADMAP.md).

# /synths — classic synths for tablet + piano

Status, 20 October 2026: all eight synths plus the sequenced machines are built and playable at `/synths/<id>/` with a hub at `/synths/`: CS-80 (played and liked on the tablet), Juno-106, Prophet-5, Jupiter-8, Minimoog, DX7, OB-Xa and Prophet VS (all built 20 Oct, not yet heard), and the TR-808, TR-909, TR-606 and TB-303 on a new in-kernel step sequencer (built 20 Oct, not yet heard). Everything up to the Prophet VS is committed (60e7fb6); the sequencer and drum machines are not. The public build now includes the comparison pages and YAML banks (see below). What to listen for: `docs/SYNTHS_LISTENING.md`.

Factory-patch formats, 20 October 2026: the Prophet VS program and wave SysEx are decoded (`docs/VS_SYSEX_FORMAT.md`). The Jupiter-8 tape decoder now handles real-world recordings and checks every patch's checksum (`docs/JP8_TAPE_FORMAT.md`). The Prophet-5/10 Rev 4 program SysEx is decoded too (`src/synths/prophet/sysex.js`, `docs/P5_SYSEX_FORMAT.md`). That gives the Prophet-5 page an import shelf and the 40 original Rev 3 programs as a yardstick before its engine exists.

**Public comparison pages (20 October 2026).** At the user's request, the public build now includes `/synths/`, all instrument pages, the engine and curated YAML comparison banks. Exact bank/program links and YAML downloads support hardware-owner testing. Raw source banks and recordings stay local. See [public testing instructions](SYNTHS_PUBLIC_TESTING.md).

**Your banks, local only.** Put factory banks in the git-ignored `banks/<synth>/` folders (`juno-106`, `jupiter-8`, `prophet-5`, `prophet-vs`, `dx7`, `oberheim-ob-xa`; `.syx`, `.wav` and `.json`). The dev and preview servers serve them at `/local-banks/` with an `index.json`, and a local `npm run build` copies them into `dist/local-banks/`, so any static server of `dist/` has them. Pages read them through `src/synths/localBanks.js`: the Juno bank shelf lists them and loads the factory bank by itself when the browser has none stored. The public build leaves them out, and `tools/checkPublicBuild.mjs` refuses a deploy containing `local-banks/` or any `.syx`.

**Drum machines and the TB-303** are scoped below (sequencer first, then 808, 909, 303, 606), compared against Roland50.studio.

**Lineup (eight):** CS-80, Juno-106, Prophet-5, Jupiter-8, Oberheim OB-Xa, Minimoog Model D, Yamaha DX7 and Sequential Prophet VS. Together they cover polyphonic and monophonic analog, FM, and wavetable/vector synthesis.

A personal sub-project. It borrows MIDI input from the labs (`LabMidi`) and the build/test conventions from the generator's kernels, but its engine is a fresh crate. It neither changes nor depends on the generator's sound engines.

## What exists

| Layer | File | Role |
| --- | --- | --- |
| Host / ABI | `synth-engine/classics/src/lib.rs` | `syn_*` exports, model select, shared effects, DC block, soft clip, stats |
| DSP kit | `synth-engine/classics/src/dsp.rs` | PolyBLEP saw/pulse, fast sine/exp2, saturating TPT SVF, analog-style ADSR, LFO set, pan, noise |
| Space FX | `synth-engine/classics/src/fx.rs` | 3-tap ensemble chorus, 8-line FDN reverb with sleep; buffers in a zero static (not in the Wasm data segment) |
| CS-80 model | `synth-engine/classics/src/cs80.rs` | Voices, parameters, control-rate tick (16 samples) with per-sample interpolation |
| Worklet | `public/synths/classics-processor.js` | Thin bridge; events apply at the next 128-frame block |
| Browser host | `src/synths/engine/liveSynth.js`, `performer.js` | Own AudioContext (`latencyHint: interactive`), batched messages, input merging |
| UI | `src/synths/ui/controls.jsx`, `cs80/Cs80Page.jsx` | Faders, switches, ribbon, touch pad, slidable keys; presets, setup, persistence |
| Juno-106 model | `synth-engine/classics/src/juno.rs` | DCO, 4-position HPF, 4-pole filter, shared ADSR/gate, delayed LFO |
| Shared kit added for the Juno | `dsp.rs` `Ladder`, `Adsr::tick_linear`; `fx.rs` `Bbd`; `alloc.rs` | 4-pole ZDF filter with saturating feedback; BBD chorus I/II/I+II; one voice allocator for every model |
| Prophet-5 model | `synth-engine/classics/src/prophet.rs` | 2 VCOs with sync, Poly-Mod at audio rate, wheel-mod, 2 ADSRs, unison with key priority and chord memory, vintage drift |
| Prophet VS model | `synth-engine/classics/src/vs.rs` | 8 voices of 4 wave oscillators (128 waves × 128 samples, band-limited tables built on first use), the vector mix (bilinear in the diamond axes) driven by a 5-point mix envelope with loops, ladder filter, looping 5-point filter/amp envelopes, 2 LFOs, a 7-source modulation matrix, per-voice pans, unison, glide |
| OB-Xa model | `synth-engine/classics/src/obxa.rs` | Two layers (upper/lower, Whole/Double/Split) of an 8-voice patch: 2 oscillators with sync and env → osc 2, noise, 12/24 dB filter, 2 ADSRs, LFO with per-destination routes, wheel vibrato, unison, poly portamento |
| Minimoog model | `synth-engine/classics/src/minimoog.rs` | 3 oscillators (6 waves, LO–2', osc 3 free-running as a modulator), mixer with pink/white noise, feedback and overdrive into the 4-pole ladder, ⅓/⅔ keyboard control, two A-D-S contours with the decay switch, low/last/high priority, single/multi trigger, glide |
| DX7 model | `synth-engine/classics/src/dx7.rs` | A Rust port of MSFA's integer DX7 pipeline (Apache-2.0): envelopes, pitch EG, LFO, tables, 32 algorithms, kernels, scaling; plus amp mod, controllers, mono/portamento and 16-voice polyphony |
| Jupiter-8 model | `synth-engine/classics/src/jupiter.rs` | VCO-1 cross-modulated by VCO-2 (sync 1→2, low-freq VCO-2), 2/4-pole filter, ENV-1/ENV-2 with key follow, Solo/Unison/Poly 1/Poly 2, arpeggiator in the engine |
| Shared kit added for the Prophet | `dsp.rs` `VcOsc`, `HalfBand` | Saw/pulse/triangle oscillator with sub-sample polyBLEP/polyBLAMP edges and hard-sync resets (output one sample late); 47-tap half-band decimator for a 2× voice path |
| Page shell | `src/synths/ui/SynthShell.jsx`, `src/synths/models.js`, `src/synths/params.js` | Audio, MIDI, sounds, setup, ribbon/pad/keys shared by every page; a page only draws its panel |
| Data | `src/synths/<model>/params.js`, `presets.js` | Parameter tables (ids must match Rust), 12 factory sounds each |
| Build/test | `tools/buildClassics.mjs`, `src/synths/engine/classics.test.js`, `tools/auditClassics.mjs` | `npm run synths:build` / `synths:check` (part of `npm run build`) / `audit:synths` |

### CS-80 voice (per note, ×8 default, up to 16)

Two complete channels, each: VCO (saw, DC-free pulse with its own PWM LFO, noise; feet 16'–2') → resonant 12 dB HPF → resonant 12 dB LPF → VCA. Sine bypasses the filters into the VCA. Filter envelope is IL → AL (linear attack) → 0 (the cutoff knob) → release back to IL, ±5 octaves, with an optional share to the HPF. Per-channel initial touch (velocity) and after touch, each driving brilliance and level.

Global: balance, channel-II detune, brilliance/resonance offsets, a sub-oscillator (7 functions, VCO/VCF/VCA depth, delayed onset), aftertouch → pitch and vibrato, and keyboard scaling of brilliance/level. The ring modulator (AM through to full ring) has an AD envelope that sweeps its speed. Also portamento/glissando from the last played note, analog drift (fixed per-voice tuning, cutoff and envelope tolerances plus slow random walk), and per-channel/voice stereo width.

Expression for a piano without aftertouch: the touch pad (height = pressure, right = vibrato), auto touch (a per-note synthetic swell after a set time), mod wheel, CC11, CC74, sustain, soft pedal (darker, quieter) and polyphonic aftertouch if sent. The ribbon is relative: wherever you touch is in tune.

Known interpretations (not circuit facts): the exact sub-osc/aftertouch routing, ring-mod envelope target, HPF envelope share and keyboard-scaling curves. The chorus and reverb are additions (the original has neither as shown here). Sustain holds notes like a piano rather than the CS-80's release-lengthening foot switch.

## Architecture: Prophet-5, Jupiter-8, Juno-106

All four are subtractive polysynths. Sharing one host, effects, UI kit and input layer is right; each model gets its own Rust module, parameter table, presets and page. The table shows what each needs beyond today's kit (**bold** = not built yet):

| | Prophet-5 | Jupiter-8 | Juno-106 |
| --- | --- | --- | --- |
| Oscillators | 2 VCO: A saw/pulse, B saw/**tri**/pulse; **hard sync** A→B; B **low-freq mode**, keyboard off | 2 VCO: VCO-1 tri/saw/pulse/square, VCO-2 sine/saw/pulse/noise; **cross-mod** 2→1, **sync** 1→2 | 1 **DCO** (no drift, precise): saw, pulse + PWM, **sub square −1 oct**, noise |
| Filter | **4-pole nonlinear ladder** (CEM3320 feel), self-oscillating; key track off/half/full | HPF (6 dB, no res) + **2/4-pole switchable OTA** (IR3109 feel) | HPF 4-step with **bass-boost** step + **4-pole OTA** (IR3109), self-oscillating |
| Envelopes | Filter ADSR + amp ADSR | ENV-1 and ENV-2 (fast, punchy) with key follow | One ADSR shared by VCF and VCA (or gate VCA) |
| Modulation | **Poly-Mod**: filter env and osc B → A freq, A PW, cutoff (audio-rate FM). Wheel-mod: LFO + noise | LFO with delay → VCO/PWM/VCF; ENV-1 → VCO pitch | One LFO with delay → DCO/PWM/VCF |
| Voices/modes | 5 (Prophet-10: 10); **unison**, glide | 8; **Solo/Unison/Poly-1/Poly-2**, **split & dual layers**, **arpeggiator**, per-voice pan | 6; poly only; the sound is mostly its chorus |
| Effects | none (space FX optional) | none | **BBD chorus I / II / I+II** (essential) |
| Alias risk | sync + audio-rate poly-mod → **2× oversampled voice path** | cross-mod + sync → same | low |

### Prophet VS (built; single mode)

Per voice: four oscillators (wave 0–127, coarse 0–24 semitones, fine over one semitone) → the vector mix → the 4-pole ladder → the amplifier. The mix weights are bilinear in the diamond's own axes (`mix_weights` in `vs.rs`): the open question in `docs/VS_SYSEX_FORMAT.md` is solved, and a test checks the manual's sheet points through the audio. A five-point mix envelope moves the position (X, Y) with the same loop machinery as the filter and amplifier envelopes (forward from point 0–2, back and forth between point 0–2 and 3, repeat counts). **Rates run 0 = fastest.** Modulation: two LFOs (triangle, square, saw down, ramp up, random) and the matrix of Figure 10-1 (LFO 1/2, pressure, velocity, keyboard, filter envelope, mod wheel onto frequencies, filter, both mix axes, LFO rates and depths, volume and pan). Eight per-voice pans, unison with detune, glide. The wave data comes from the host through a shared buffer (`syn_wave_ptr` / `syn_wave_commit`): the page composes it from a built-in set of original additive waves, then your two wave-set WAVs (ROM 32–127) and the program set's user-wave dump (0–31), keeps the result in the browser as 16-bit samples, and the engine builds band-limited tables (half-octave harmonic levels, 63 down to 1) for a wave the first time a voice uses it. "Waves: Raw" reads the original 128 samples directly, with the original's aliasing.

- **Page:** a vector pad (the diamond with the mix envelope's five points; dragging adds a live joystick offset, springing back unless Hold is on), four oscillators, mix envelope, filter, both envelopes, LFOs, the modulation matrix as buttons, voice pans, chorus and reverb. The "VS programs" shelf loads a program .syx with its waves (or any mix of files picked together); the local factory and cartridge sets load by themselves, waves included.
- **Audits:** `npx vite-node tools/auditVsBank.mjs <programs.syx> [--quiet] [--wav dir]`. Factory set median −29 dB held (range −61 … −16), cartridge set −24 dB; all 200 finite.
- **Chorus** is the shared one: the program's chorus rate and depth are mapped onto it (the pressure-to-chorus route is not applied).
- **Not built:** split and double keyboard modes with the linked program, the arpeggiator, the pressure → chorus routes and the exact chorus. Interpretations: every unit above, what R4A does, how a forward loop returns.

### OB-Xa (built, with double and split)

A single layer (`ObXa`) is: two oscillators (saw and pulse, each or both; a shared pulse-width knob; oscillator 2 detune, hard sync to oscillator 1, and the filter envelope sweeping oscillator 2 by two octaves, an estimate) → a mixer (oscillator 1 on/off, oscillator 2 off/half/full, noise on/off) → the shared ladder with a 12 dB (second-stage) or 24 dB output and key tracking → VCA; filter and amplifier ADSRs; one LFO (sine, square, sample & hold, summed when several are on) with separate switches for pitch (oscillator 1, 2, filter) and pulse width (oscillator 1, 2); a separate wheel vibrato LFO with its own rate and depth; unison (all voices on the newest key, spread by a detune), polyphonic portamento (each voice glides from the note it last played) and the "bend oscillator 2 only" switch. `ObXa2` wraps two layers with the Jupiter's key-mode mechanism: Whole (upper only), Double (both on every key) and Split, the voices shared half and half and Balance setting the levels. Upper ids 0–63, lower 64–127, key mode 128–130.

- **Patch book:** the "Patch book" shelf loads the measured JSON (`banks/oberheim-ob-xa/patch-book.json`, auto-loaded locally, never bundled) and maps each program by `engineValues` in `src/synths/obxa/book.js`: oscillator pitches from the printed notes, knobs 0–10 → exponential ranges, detune centred on 5. A program loads into the layer being edited. All 96 play, median −21 dB held (`npx vite-node tools/auditObxaBook.mjs <patch-book.json> [--quiet] [--wav dir]`).
- **Interpretations to tune by ear:** every unit range (`CALIBRATION` in `book.js`), the detune range (±100 cents for the full knob), the envelope-to-oscillator-2 depth, the unison detune, pulse-width law, the wheel vibrato depth (about a semitone), the noise level, how hard key tracking is (an on/off switch here, full tracking), the filter's resonance behaviour.
- **Not built:** programmer memory and the original's chord and hold functions, per-program split points, the original's voice-card tolerances beyond a small spread, the book's group C (not in the scan).

### Minimoog Model D (built)

One voice. Oscillators 1 and 2 follow the keyboard (ranges LO–2'), oscillator 3 can run free of it and then serves as the modulator (LO range = 0.35–45 Hz). Waveforms: triangle, shark-tooth (a triangle plus a saw), saw (reverse saw on oscillator 3), square, wide and narrow pulse (estimated widths 33 % and 17 %). All edges are band-limited (`VcOsc`, 2× path on by default). Mixer: three oscillators and noise (white or pink) with on/off switches, an output-to-input feedback knob and a drive stage; hot levels overload the filter input with an asymmetric soft clip (a triangle gains even harmonics, tested). Filter: the shared 4-pole ladder, singing from about 90 % emphasis; keyboard control ⅓ + ⅔ (full tracking, tested to an octave per octave). Two contours (attack, decay, sustain) and the decay switch (release follows the decay, otherwise ~12 ms). Wheel: oscillator 3 or noise to pitch and/or filter. Single trigger is legato (a second key does not retrigger the contours); low-note priority returns to the held lower key; glide is a pitch smoothing. Velocity and pressure routes are additions.

- Interpretations to tune by ear: the drive curve and filter input level, the pulse widths, shark-tooth shape, the amount the contour opens the filter (up to 5 octaves), the mod depths, glide time.
- Not built: the headphone-out loop beyond the feedback knob, the original's exact oscillator drift, external input.

### Jupiter-8 (built, with split and dual layers)

Per voice: VCO-1 (triangle, saw, pulse, square; 16'–2') with linear cross-mod from VCO-2; VCO-2 (sine, saw, pulse, noise; continuous range and fine; sync to VCO-1; low-frequency mode) → source mix (a balance: both full in the centre) → 6 dB HPF → OTA-style filter with a 12 dB tap (second stage, still resonating through the four-stage loop) or 24 dB output → VCA (ENV-2, LFO tremolo in 3 steps). ENV-1 (normal/inverted) drives VCO pitch, pulse width or the filter; the VCF takes ENV-1 or ENV-2; both envelopes can shorten up the keyboard (key follow). One delayed LFO (sine, saw, square, random). Assign: Solo and Unison (single trigger, last-note priority), Poly 1 (reuses a key's voice, lets releases ring) and Poly 2 (rotates through the voices). Portamento. Arpeggiator (up, down, up/down, random; 1–4 octaves; rate; hold) clocked in the engine at control rate (0.33 ms). 2× voice path when sync or cross-mod is on.

- **Factory patches:** the "JP-8 tape" shelf decodes a tape WAV in the browser (only the decoded 64 × 28 bytes are stored) and names factory patches by fingerprint (`names.js`). All 64 factory patches render finite and audible: held-triad median −27 dB (`npx vite-node tools/auditJupiterTape.mjs <tape.wav> [--quiet] [--wav dir]`).
- **Switches settled from the patches:** VCF env lever up = ENV-1 (every "down" patch has a flat ENV-1 and a shaped ENV-2). Slope lever up = −12 dB is likely (strings, flutes, voices up; brass, sync, organs down) but not confirmed.
- **Layers (20 Oct):** `Jupiter8` in `jupiter.rs` wraps two complete patches (upper ids 0–63, lower 64–127, key mode / split point / balance 128–130). Whole plays the upper layer; Dual plays both on every key; Split sends keys below the split point to the lower layer (the split key itself is upper). In Dual and Split each layer gets half the voices, rounded up (the original's 4 + 4), each keeps its own assign mode, arpeggiator and LFO, and Balance sets their levels. Changing the key mode releases held notes. The page edits one layer at a time (Layer picker, "Copy to lower/upper"); the tape shelf loads into the selected layer. Three layered presets: Bass | Strings (split), Brass + Strings (dual), Arp | Pad (split).
- **Not built yet:** the 0x81 panel-memory record, the arpeggiator synced to MIDI clock, a shared (rather than per-layer) arpeggiator and portamento as on the original, and the original's per-layer tone-mix behaviour in Dual. Interpretations: cross-mod is linear and never runs VCO-1 backwards; VCO-2 low-frequency rates; Poly 1/Poly 2 behaviour; all unit ranges (`CALIBRATION` in `patch.js`).

### Prophet-5 (built)

Per voice: Osc A (saw, pulse; hard-synced to B) and Osc B (saw, triangle, pulse; low-frequency mode with Funkybot's measured rates; keyboard tracking off) → mixer with noise → 4-pole ladder (Rev 3 or the slightly hotter Rev 1/2) → VCA. Filter ADSR and amplifier ADSR (analog-style curves), release switch. Poly-Mod sends the filter envelope and Osc B (per sample) to Osc A frequency, Osc A pulse width and the cutoff. Wheel-mod mixes the LFO (saw, triangle, square in any combination) with noise, scaled by the initial amount plus the mod wheel, into five destinations. Unison stacks voices with detune and Rev 4 key priority (low/last/high, with or without retrigger); chord memory plays one voice per stored note. Rev 4 velocity and aftertouch routes. Vintage adds per-voice tuning, cutoff and envelope tolerances and a slow wander. The voice path runs at 2× (half-band decimated) when sync or audio-rate Poly-Mod is on ("2× rate": off/auto/on).

- **Aliasing** (2.63 kHz fundamental, energy between harmonics): saw −36 dB at 1×, −56 dB at 2×; sync −34 dB at 1×, −55 dB at 2×; triangle −61 / −77 dB. Tested in `src/synths/engine/prophet.test.js`.
- **Factory programs:** the "P5 programs" shelf imports Sequential's Rev 4 file (banks F1–F5, groups 1–5, programs 1–8) and maps each program onto the engine (`engineValues` in `sysex.js`). All 200 render finite and audible: held-triad median −26 dB, no clipping (`npx vite-node tools/auditProphetBank.mjs <file> [--quiet] [--wav dir]`).
- **Found through the factory set:** the Rev 4 knob range is 0–127, not 0–120. Keyboard tracking counts from the lowest key (C2), not middle C. The filter must sing from about 87 % resonance, because RESONANCE BELLS has no oscillator and rings the filter with Poly-Mod at 120/127.
- **Estimates to tune by ear or against recordings:** cutoff range (20 Hz–20 kHz exponential), envelope times (1 ms–10 s attack, 2 ms–15 s decay/release), LFO 0.05–25 Hz, glide, Poly-Mod and wheel-mod depths, mixer taper, the Rev 1/2 filter difference. House Vibez (cutoff 0, wheel-mod on the filter) still renders at −66 dB, which suggests the bottom of the cutoff range is too low.

### Juno-106 (built)

Per voice: DCO (saw and pulse switches, manual or LFO pulse width, sub-octave square phase-locked to the DCO, noise) → HPF (bass boost / flat / ~240 Hz / ~720 Hz) → resonant 4-pole low-pass (self-oscillates at the top, loses some bass as resonance rises) → VCA (envelope or gate). One linear-attack ADSR drives filter and amplifier (positive or inverted for the filter). One triangle LFO with a delay that restarts at the start of a phrase. BBD chorus I (0.51 Hz), II (0.86 Hz), I+II (9.75 Hz, shallow), with band-limited wet path and optional hiss. DCOs don't drift; filters/amplifiers vary a little per voice ("Voice spread"). Additions for piano playing: velocity → VCF/VCA, touch pad pressure → VCF, bend amounts to DCO/VCF, mod → vibrato. Interpretations: the HPF corner frequencies and the BBD rates/depths are approximations of published figures, not measurements.

### Factory sounds as a quality yardstick

**Juno-106: imported banks (`src/synths/juno/sysex.js`, `BankBrowser.jsx`).** The "106 bank" shelf loads any Juno-106 SysEx file (the factory bank is 128 × 24-byte patch dumps, 3 KB) from a file or a link, keeps it in that browser's storage, and browses it with A/B · bank 1–8 · number 1–8 buttons plus ◂ ▸ stepping. No patch data is bundled with the site (Roland sells the factory set as "The Original 128"); only the decoder and the factory patch names are. Imported patches play as the hardware: velocity/pressure routes off, no reverb.

- Format: slider order and the button/switch bits follow the JAMRouter Juno-106 notes (williamweston/jamrouter `doc/juno-106.txt`); the two HPF bits are read as plain binary (3 − value), as the KR-106 project does, because one published table implies the opposite order. Organ patches decoding to gate mode confirm the switch-bit order. Names: the factory list republished on hinzen.de / synthmania.
- Calibration (`CALIBRATION` in `sysex.js`, one place): Roland's published end points for envelope (A 1.5 ms–3 s, D/R 1.5 ms–12 s) and LFO (0.1–30 Hz, delay 0–3 s). Estimated, to be tuned against recordings: envelope curve shape (mostly cubic with a small linear term so short settings stay usable), filter range (~6 Hz–24 kHz, 12 octaves, keyboard tracking counted from the lowest key), 10-octave envelope depth (engine change; the 12 Juno presets were rescaled to sound the same), VCA level slider as −20…0 dB (factory patches sit at 0 yet sound), DCO LFO depth.
- Engine changes found by the bank: HPF now matches published figures (+3 dB shelf at 70 Hz; 6 dB/oct one-pole cuts at 225 and 700 Hz); a self-oscillating filter starts each voice already ringing (otherwise short "ping" patches such as A82 Resonance Funk were silent); resonance fades as the cutoff is pushed past ~0.3 × sample rate (otherwise wide-open resonant patches whined at the clamp).
- Audit: `npx vite-node tools/auditJunoBank.mjs <bank.syx> [--wav dir]` renders every patch (held triad) with level/peak/brightness; with the factory bank all 128 are finite, median −30 dB, the quietest being very short percussive patches (Hand Claps, Pizzicato, Shaker), which may still be too quiet/dark.
- Next: compare against recordings of the real patches. Single held notes per patch allow mostly automatic fitting of the filter curve, envelope shape and levels; musical demos only allow by-ear comparison.

**Prophet-5: Sequential's own bank (`src/synths/prophet/sysex.js`).** Sequential gives the Rev 4 factory programs away as SysEx (200 programs). Factory bank 5 is the original 1978–80 Rev 3 set: BRASS, SYNC II, PULSE WIDTH MOD and so on. Every panel control decodes. Two things are still estimates or extrapolations: physical units for cutoff, envelopes and LFO (to be fitted by ear or from recordings), and the top of the Osc B low-frequency rate table. Manual import remains available alongside the bundled YAML comparison bank.

**Jupiter-8: the factory cassette (`src/synths/jupiter/tape.js`).** A WAV of the data tape decodes into the 64 factory patches with checksums. A stress test (noise, hum, level, speed, wow, dropouts, stereo faults) never let a wrong patch through unflagged.

**OB-Xa, Minimoog, DX7: planned yardsticks.**
- **DX7:** the ROM cartridge SysEx. Same import-shelf pattern; documented format. A decoder and YAML export come first, like the Prophet.
- **Minimoog:** Moog's sound charts, transcribed as panel settings (there is no patch memory to import).
- **OB-Xa: the factory patch book, measured** (20 Oct): 96 of the 104 factory programs (group C is missing from the scan), with knob angles and switch LEDs measured from the book's panel drawings and names and pitch notes read from the titles. See `tools/obxa-patch-book/`. The output is in git-ignored `banks/oberheim-ob-xa/patch-book.json` (auto-loaded locally) and `patches/oberheim-ob-xa/factory.yaml`. Owners' MIDI-kit dumps vary by kit, so support one only if a real file turns up.

**CS-80: approximations (`src/synths/cs80/factory.js`).** The "Factory (approx.)" shelf has the original two rows of 11 presets in the original order (row I: Strings 1, Strings 3, Brass 1, Flute 1, Electric Piano, Clavichord 1, Harpsichord 1, Organ 1, Guitar 1, Funky 1, Funky 3; row II: Strings 2, Strings 4, Brass 2, Brass 3, Bass 1, Clavichord 2, Harpsichord 2, Organ 2, Guitar 2, Funky 2, Funky 4 — as listed in XILS-lab's The Eighty manual and consistent with button positions cited elsewhere). Each sets only its own channel, so rows combine as on the original; "Neutral panel" resets the global controls. The settings are estimates from names and descriptions: the real presets were fixed circuits never documented as panel settings. Treat them as starting points, not a reference.

## Architecture: OB-Xa, Minimoog Model D, DX7

The first two are subtractive and reuse the kit above. The DX7 is a different family (6-operator FM) with its own voice engine, but it uses the same host, input, effects and page shell. The table shows what each needs; **bold** = not built yet.

| | Oberheim OB-Xa (1981) | Minimoog Model D (1970) | Yamaha DX7 (1983) |
| --- | --- | --- | --- |
| Oscillators | 2 VCOs per voice (CEM3340): saw, pulse with PW; **sync**; osc 2 detune; **filter-env → osc 2 pitch** | **3 VCOs**: triangle, tri-saw, saw, square, wide/narrow pulse (osc 3 has reverse saw instead of tri-saw); ranges LO/32'–2'; **osc 3 keyboard off → LFO** | **6 sine operators**, ratio (0.5–31) or fixed Hz, detune; **32 algorithms**, feedback on one operator |
| Filter | CEM3320 4-pole low-pass with a **12/24 dB switch** (2-pole tap of the ladder); key track | **Moog transistor ladder**, 24 dB, self-oscillating; key control off/⅓/⅔/full; **overdrive** from hot mixer levels (and the classic headphone-out → ext-in feedback trick) | none |
| Envelopes | Filter ADSR + amp ADSR | Filter and loudness contours: **attack, decay, sustain, with the decay switch making release = decay** | Per operator: **4 rates + 4 levels**; pitch EG; **rate and level keyboard scaling** (breakpoint, 4 curves) |
| Modulation | LFO (sine, square, S/H) → freq, PW, filter; mod wheel depth | **Modulation mix**: osc 3 / filter contour vs noise; wheel depth; destinations osc and filter | LFO (tri, saw ↓↑, square, sine, S/H) with delay → pitch/amp; velocity 0–7 per operator; wheel/breath/aftertouch routing |
| Voices/modes | 4/6/8 voices; **split and double** (two programs), **unison**, polyphonic portamento | **Monophonic**, low-note priority, single trigger; glide | 16 voices; mono mode with portamento |
| Effects | none | none | none (the original **12-bit DAC with exponent scaling** gives its edge: worth emulating as a switch) |
| Patch data | 120 programs; no MIDI SysEx on the original (later kits add it); **patch sheets and owners' charts** | no memory: **Moog's published sound charts** (panel settings) | **SysEx cartridges** (ROM1A–4B factory sets, 32 voices, 4104-byte bulk dumps, 128 bytes/voice); fully documented |
| Alias risk | sync → oversampled path | ladder driven hard → oversampled filter | high-ratio operators with feedback → **2× oversampling or band-limited sine look-ups**; the repo's FM kernel has a decimator to learn from |

### DX7: engine source and the classic sounds

**Built (20 Oct): a port of MSFA's integer pipeline.** The plan below was to copy the generator's FM kernel and replace its envelopes, scaling and LFO. Once MSFA's source was at hand, porting its measured DX7 pipeline whole was the better base, so `dx7.rs` is that port (attributed in `synth-engine/classics/NOTICE-MSFA.md`; Apache-2.0, Dexed stays a listening reference only). What is ported: the envelope (rate/level tables, the 1716 attack jump, 44.1 kHz calibration scaled to the sample rate), the pitch EG, the LFO with delay, the exp/sin/frequency tables, the 32 algorithms with the two-sample-averaged feedback, the keyboard level/rate/velocity scaling, coarse/fine/fixed frequencies and detune, in 64-sample blocks. Added: amplitude modulation (AMS 0–3 × AMD, estimated at up to 6 amplitude doublings), mod wheel and pressure into the LFO pitch depth, bend in semitones, master tune, operator switches, mono mode with a linear portamento, 16-voice polyphony and stealing. The generator's kernel is untouched.
- **Parameters** 0–155 are the DX7's own voice layout (operator 6 first, 21 values each), so a cartridge voice loads by index (`src/synths/dx7/voice.js`); the page has an algorithm diagram, an operator picker and a cartridge shelf (banks 1–4 × voices 1–8, ROM1A auto-loads locally).
- **Known deviations:** algorithms 4 and 6 have feedback loops across several operators, which MSFA (and so this port) does not run: those two have no feedback sound. The DX7's output DAC and its 12-bit exponent stage are not emulated. Voice parameters are read at note-on (a held note does not follow panel edits). The original single LFO and the delay restart on every key.
- **Audit:** `npx vite-node tools/auditDx7Cart.mjs <cart.syx> [--quiet] [--wav dir]`. All 32 ROM1A voices render finite (median −27 dB, ≥68× real time). Reference renders from Dexed are still the missing yardstick.

*(Original plan, kept for the reasoning:)* **Start from the generator's FM kernel, as a copy.** `synth-engine/fm` already has the parts that are hard to get right:
- 6 operators with a free routing matrix and carriers (enough for all 32 algorithms)
- two-sample averaged feedback (the DX7's own trick)
- ratio/fixed frequencies, 2×/4× oversampling with a decimating FIR, 32 voices, sample-timed events

It is *not* a DX7. Its envelopes, level/rate scaling, LFO and output stage are its own. The plan is to copy the operator core into `synth-engine/classics/src/dx7.rs`, then replace those parts with DX-accurate ones. The generator's kernel is not changed, so the music generator can't regress.

**The classic sounds are Yamaha's ROM cartridges.** The DX7 shipped with ROM1A/1B; ROM2–4 followed, 32 voices each: E.PIANO 1, BASS 1, BRASS 1, TUB BELLS, MARIMBA, HARPSICH 1 and so on. They are SysEx cartridge dumps (`F0 43 00 09 20 00` + 4,096 bytes + checksum + `F7`, 128 packed bytes per voice), widely available. The same import shelf handles the community's cartridge collections and generated ones (e.g. thisdx7cartdoesnotexist.com). Selected cartridges are now bundled as YAML for public comparison testing.

**What makes E.PIANO 1 sound like E.PIANO 1** is the DX7's exact behaviour, more than the patch data:
- the rate/level-to-time tables of its envelopes
- output level 0–99 on its log scale, and the keyboard level and rate scaling curves
- the pitch EG and the LFO waves, including the S/H
- the 12-bit log-sine/exponent table maths, and the DAC with its exponent gain stage, which gives the slightly gritty top

All of these were measured from real units by the **MSFA project** (Raph Levien's Music Synthesizer for Android, **Apache 2.0**): its tables can be ported with attribution. **Dexed** builds on MSFA but is GPL-3, so it serves as a listening and render reference only; no code is copied.

**Yardstick:** render every ROM1A voice in an audit tool (like `auditJunoBank.mjs`) and compare against reference renders (Dexed) and recordings of the hardware. Envelopes and levels can be compared numerically, since FM is deterministic.

## Architecture: Prophet VS (vector synthesis)

Per voice (8 voices): **4 digital oscillators** (A, B, C, D), each playing a 128-sample, 12-bit single-cycle wave. Waves 0–95 are in ROM and 96–127 are user waves. Coarse frequency spans 0–24 semitones, plus fine tune. The four are mixed by the **joystick** in a diamond (A left, B top, C right, D bottom). A **5-point mix envelope** (rates and X/Y levels, loop and repeat) can move the mix automatically. The result goes through a **Curtis 4-pole resonant low-pass (CEM3379)** and an amplifier, with 5-stage looping filter and amp envelopes (rates 1–4A, levels 0–3), 2 LFOs (5 shapes), a modulation matrix (LFOs, pressure, velocity, keyboard, filter env, mod wheel → freq, filter, mix, LFO rates, amp, pan, chorus), per-voice pan, stereo chorus, split/double/unison and an arpeggiator.

- **Reuse:** `Ladder` (4-pole), voice allocator, BBD/ensemble chorus, the shared page shell. The **touch pad** becomes the vector joystick, which is natural on the tablet.
- **New:**
  - a band-limited wavetable oscillator (mip-mapped tables from the 128-sample waves, about 1 MB in all), with a "raw 12-bit" switch for the original's aliasing character
  - the 4-way vector mixer and the 5-point mix envelope with loop and repeat
  - 5-stage looping envelopes and the modulation matrix
- **CPU:** 4 table reads per voice, lighter than a CS-80 voice.
- **Data** (user's files, imported, never bundled):
  - **Waves:** the Groove Synthesis 3rd Wave update holds all 128 VS waves as two 8,192-sample WAVs (64 × 128 samples each: user 32 + ROM 1–32, and ROM 33–96). The VS cannot dump its ROM waves over MIDI, so these are the only source for the factory sound set.
  - **Programs and user waves: decoded** (20 Oct). See `docs/VS_SYSEX_FORMAT.md` and `src/synths/vs/sysex.js`. Programs are 82 bytes, the fields of the manual's Table 14-1 bit-packed in order. It was confirmed against the manual's program list and four filled-in sheets. User waves are 192 bytes each: 128 signed top bytes plus 64 bytes of low nibbles. The factory and cartridge banks export to YAML (`patches/prophet-vs/`).
  - **Still open:** the joystick X/Y → four-way mix formula (the sheets give test points), and units for rates and levels.
- Same family, later: PPG (scanning one wavetable) and Wavestation (wave sequences plus vector mix) reuse the oscillator.

### Missing building blocks, in dependency order

1. ~~**Nonlinear 4-pole filter**~~ (done for the Juno: `Ladder`; the Jupiter's 2-pole mode still needs a tap/variant) (ZDF ladder with per-stage saturation; OTA flavour with 2-pole tap): used by Prophet, Jupiter and Juno. The single biggest item. Tests should cover self-oscillation tracking, resonance bass loss/compensation and stability at Nyquist.
2. **Oscillator extensions** (partly done for the Prophet: `VcOsc` has sub-sample hard-sync resets and the polyBLAMP triangle): still to do are the divide-down sub, a DCO mode (no drift) and a through-zero-safe linear FM input.
3. ~~**Optional 2× oversampling**~~ (done: `HalfBand`, used by the Prophet when sync or audio-rate Poly-Mod is on) of the oscillator→filter path with a half-band decimator, switched on only when sync/cross-mod/poly-mod is active.
4. ~~**BBD chorus**~~ (done): two triangle-modulated lines at Juno-like rates, BBD bandwidth/companding colour and optional hiss. It belongs in `fx.rs` next to the ensemble.
5. **Host voice modes**: mono/legato/unison with stacking detune, glide modes, and **layers** (two model instances with split point or dual) for the Jupiter.
6. **Arpeggiator and tempo**: reuse `src/labs/arpeggiator.js`. For tight timing, add sample-timestamped events to the ABI (live play does not need them; an arp does).
7. **Mono voice path** (Minimoog): one voice with note priority (low/last/high), single/multi trigger and legato glide. The Minimoog also needs the 3-VCO mixer with overdrive into the ladder, and osc 3 as a modulator. The Prophet's unison and the DX7's mono mode reuse it.
8. **Split/double** (OB-Xa, Jupiter-8): two programs sharing the voice pool by key range or stacked. This is the same mechanism as item 5's layers.
9. **FM operator engine** (DX7): a copy of the generator FM kernel's operator core (routing, feedback, oversampling, voices) in the synths crate. Its envelopes, scaling, LFO, pitch EG and output stage are replaced by DX-accurate versions ported from MSFA's measured tables (Apache 2.0, attributed). The generator's kernel stays untouched.
10. **Wavetable/vector oscillator** (Prophet VS): band-limited single-cycle tables with a raw 12-bit mode, the 4-way joystick mixer and the looping 5-point mix envelope. Later reusable for PPG and Wavestation.

### What's missing beyond these eight

- **Further candidates** after the eight: an Oberheim SEM (2-pole multimode SVF, which already exists), a Korg MS-20 (aggressive Sallen-Key), PPG and Wavestation (on the VS oscillator), and the families still missing entirely: sample-based (M1, D-50 style) and physical modelling.
- **Performance**: MIDI learn (map the piano's knobs and pedals to any parameter), program change → presets, MPE (per-note bend/pressure) and sostenuto.
- **Patches**: export/import files, a share link, A/B compare, undo. Presets are currently local to the device.
- **Platform**: Safari on iPad has no Web MIDI. Use Chrome on an Android tablet, a Web MIDI-capable iPad browser, or the on-screen keys. A PWA manifest would give a home-screen icon and offline use. Measure CPU on the actual tablet; the existing memory notes say phones are CPU-bound.

## Drum machines and the TB-303 (built 20 Oct; listen next)

**Built:** `seq.rs` (clock, swing, pattern select at the bar line, chain), `drums.rs` (one engine, three voice sets: TR-808 with 16 tracks, TR-909 with 11, TR-606 with 7) and `tb303.rs`. Kernel models 8 TR-808, 9 TR-909, 10 TR-606, 11 TB-303; `syn_seq(cmd, a, b)` carries the sequencer commands (0 play/stop, 1 set a step, 2 pattern, 3 chain slot, 4 chain length, 5 pattern length (a = steps, b = pattern), 6 rewind, 7 clear, 8 pattern tempo (a = pattern, b = bpm, 0 = global)) and `syn_stat(4..6)` the playhead (step, pattern, running; the worklet reports forty times a second for these models). The clock runs inside the render loop and splits blocks at step boundaries, so steps land on their exact frame at any block size (tests check 128, 333 and 2048). Pages: `src/synths/drums/` (kits, `DrumPage`: step grid with an accent row, tap or drag to paint, tap a name to hit the pad and edit its level, tune, decay, tone and pan; a mixer of all levels; six starter beats) and `src/synths/tb303/` (a piano-roll grid of twelve semitones plus the top C, tie, octave up/down, accent and slide rows; four starter lines). Patterns, chain and the current letter live in the browser (`synths:<id>:patterns`). A piano key plays a pad: C2 is track 1, wrapping every two octaves; on the 303 the keys play the bass live (a hard hit accents, a held key plus another slides).
- **Voices:** kick = sine with a falling pitch, a click and soft saturation; snare = two resonators plus filtered noise; toms and congas = swept sines; rim = two ringing sines clipped; clap = band-passed noise in three bursts and a tail; cowbell = two squares through a band-pass with a two-stage decay; hats and cymbals = the six square oscillators (205.3, 304.4, 369.6, 522.7, 540 and 800 Hz) through high-pass and band-pass, the closed hat choking the open one; maracas = high-passed noise; claves = a ringing sine. The 909's hats, crash and ride are stand-ins: the same metal source plus noise and a 6-bit quantiser (the originals are ROM samples).
- **TB-303:** saw or square into the four-pole ladder (the passband drops with resonance, as on the original), a filter envelope with a Decay knob, an accent circuit that builds over consecutive accented notes (more level, more envelope, shorter decay), slide as a fixed glide with no envelope re-trigger, gates of 60% of a step unless tied or slid into the next step, and a drive stage.
- **Estimates:** every voice's pitches, decays and filter frequencies are by ear and from circuit descriptions, not measured. Compare against Roland50.studio by ear only (its assets are never extracted). Added later the same day: **flam** (a quiet grace note 10–45 ms before the beat, the Flam knob sets the gap; steps fire 50 ms ahead of sound so the main hit stays on the grid), **three accent strengths** per step (the accent row cycles 3 → 2 → 1 → off), **pattern length 1–16** and an **own tempo per pattern**, and **MIDI clock follow** (clock only steers the tempo; start/continue/stop control the transport; the internal clock stays sample-accurate). Not built: the 808's accent as a separate bus level, the 909's shuffle steps, MIDI clock output, the TR-707 and SH-101.

**Original scope notes (kept for the record):**

The voices are cheap on CPU and small in code. The real cost is shared infrastructure /synths does not have yet.

**Foundation: a sample-accurate sequencer.** Live play applies events at the next 128-frame block, which wobbles by up to 3 ms. A programmed groove needs exact timing:
- **Events:** carry sample timestamps through the ABI, with a clock (tempo, swing/shuffle, flam) running in the worklet.
- **Patterns:** 16 steps per instrument, accent per step, chaining.
- **UI and input:** a tablet step grid, and a note map so the piano plays the kit.

The generator's percussion crate (`synth-engine/percussion`) has a timestamped event heap and a fixed voice pool worth copying (copy, not share, as with the FM kernel). Its "808-inspired" kit is recipe-style, not circuit-level, so its sounds don't carry over. The same sequencer later drives the Jupiter-8 and Prophet VS arpeggiators.

| | Inside | New DSP | Size |
| --- | --- | --- | --- |
| **TR-808** (1980) | Analog voices. Kick, toms, congas and rim are pulse-struck bridged-T resonators; snare adds filtered noise; clap is noise with a triple-retrigger envelope and a tail; cowbell is two square oscillators through a band-pass; hats and cymbal are six square oscillators through band-passes, with the closed hat choking the open one. | Struck resonator, six-oscillator metal source, clap envelope, choke groups, accent bus. Published circuit-level models exist for the kick, cowbell and cymbal. | Medium–large; the best documented. |
| **TR-909** (1983) | Analog kick, snare, toms, rim and clap; **hats, ride and crash are 6-bit ROM samples**. | Mostly 808 parts reused. The cymbals need Roland ROM data imported by the user (like the VS waves) or a synthesised stand-in. | Medium after the 808. |
| **TR-606** (1981) | Seven simpler analog voices on the same principles. | Almost nothing new. | Small. |
| **TB-303** (1981) | A monophonic bass synth with its own sequencer: one oscillator (saw, or a square shaped from it), a resonant low-pass with its own nonlinear character, envelope decay, **accent** (builds over consecutive accented notes) and **slide** (fixed glide). | A 303 filter variant (the Juno `Ladder` is a relative), the accent circuit, and the mono voice path (building block 7). The sequencer needs tie, slide and accent per step. | Medium to build, long tail to sound right. |
| TR-707 / SH-101 | Sample-based drums (ROM data, user import) / one-oscillator mono synth. | Little beyond the above. | Small, optional. |

**Data:** none of these has factory patch data to decode: they are set by knobs and patterns. The exception is the 909 cymbal ROM.

**Reference: Roland50.studio** (roland50.studio). Roland's free browser studio (with Yuri Suzuki) has the TR-808, TB-303, SH-101, TR-606, TR-707 and TR-909, step sequencers and recording export (MP4). Use it two ways:
- **By ear:** the same pattern on theirs and ours, switching in the browser.
- **Measured:** export single hits and short patterns, extract the audio with ffmpeg, and compare pitch sweep, decay time, spectrum and loudness in an audit tool.

Compare only: its sound assets are not extracted or shipped. It is described as a simplified rendition, so published circuit studies and recordings of real units remain the stricter check.

**Order:**
1. Sequencer and TR-808 together (done).
2. TR-909, reusing the 808 voices (done).
3. TB-303 (done; the drum and bass patterns share the clock but run in separate pages).
4. TR-606 (done).

## Plan

1. **Listen and tune the CS-80 on the tablet** (done: the one-page layout came out of this). Check feel first (velocity curve, touch-pad and auto-touch defaults, ribbon range, latency), then each preset by ear. Record voice counts/peaks from the header meter while playing with the pedal down.
2. **Shared DSP pass**: 4-pole filter, oscillator extensions and optional oversampling, each with focused tests and a spectrum/alias audit in `tools/`.
3. **Juno-106** (built 19 October; listen next, especially the filter sweep, resonance whistle and chorus modes).
4. **Prophet-5** (built 20 October; listen next: SYNC sweeps, Poly-Mod bells, unison, and the Rev 3 programs in F5 against recordings to calibrate units): sync, poly-mod, unison and oversampling.
5. **Jupiter-8** (built 20 October with split/dual layers, assign modes, arpeggiator and tape import; listen next): layers/split, assign modes and arpeggiator on top of everything above.
6. **Minimoog Model D** (built 20 October; listen next): mono voice path, 3 VCOs, overdriven ladder. A good test of the filter on its own, since nothing else masks it.
7. **OB-Xa** (built 20 October; listen next): mostly assembly by then (2-pole/4-pole filter, sync, split/double). Its character is in the filter and the brassy envelopes.
8. **Prophet VS** (built 20 October; listen next):
   - ~~program SysEx decoder, user-wave decoder, wave loading from the WAVs, YAML export~~ (done 20 Oct)
   - ~~the wavetable oscillator, vector mixer (mix formula fitted to the sheet points) and mix envelope~~ (built 20 Oct)
   - still open: split/double with the linked program, the arpeggiator, an exact chorus
9. **DX7**:
   - ~~cartridge SysEx decoder and YAML export~~ (done 20 Oct: `src/synths/dx7/sysex.js`, 32-voice bulks and single voices, checksum checked)
   - ~~the engine~~ (built 20 Oct as a port of MSFA's pipeline; page with algorithm diagram and cartridge shelf)
   - check ROM1A renders against reference renders (Dexed) and recordings by ear
10. Along the way: MIDI learn and patch files, as soon as more than one synth exists.

Order 4–9 is a suggestion; the formats work so far means either the Prophet-5 or the Jupiter-8 can come next.

Each model is a Rust module in the same crate (one `classics.wasm`, about 20–30 KB per model; the DX7 may be larger). Split into per-model Wasm files only if download size starts to matter.


## Key-press onset (20 Oct)
Every polyphonic engine now fades a voice in over about 4 ms (`Onset` in `dsp.rs`, a smoothstep) when a key starts it from silence, because several presets began with a step (a pop) when the envelope attack was near zero or the oscillator started mid-cycle. A voice that is still sounding when it is reused keeps its gain. `src/synths/engine/onset.test.js` checks every preset of every engine at three pitches.

## Scope and spectrum (20 Oct)
Every /synths page has a **Scope** button in the header: an oscilloscope and a spectrum analyser on the synth's final output (left and right averaged, after the shared chorus and reverb). The audio worklet keeps the last 1.3 s in a ring and returns a copy on request (`requestScope` in `liveSynth.js`); the page asks about thirty times a second (`src/synths/ui/Scope.jsx`, maths in `scopeMath.js` with tests).
- **Scope:** 1–500 ms across, vertical zoom ×1–×50, rising or falling edge trigger with a level slider, and Auto (free-runs when nothing triggers), Normal (holds the last trace) and **Single** (arm, play: the first trigger after arming is captured and held, with its frame count and time). 10% of the screen shows the time before the trigger. Stop freezes the display; tapping or dragging reads time from the trigger and level at that point; samples show as dots when zoomed far in. Readouts: peak, peak-to-peak, RMS, and the pitch (normalised square difference, with the note and cents). **Save WAV** writes what is on screen.
- **Spectrum:** 8192-point Hann-windowed FFT (0 dB = a full-scale sine), 20 Hz–20 kHz log axis, −100…0 dB, light smoothing, optional **Peak hold**, a tap shows frequency and level, and the strongest peak is named. In Single mode it analyses the captured block (up to 8192 samples from the trigger).
- Not done: stereo traces, a dual cursor, spectrogram, pre-effects tap.

