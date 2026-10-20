# /synths — classic synths for tablet + piano

Status, 19 October 2026: CS-80 (`/synths/cs80/`, played and liked on the tablet) and Juno-106 (`/synths/juno/`, new, not yet heard) are playable, with a hub at `/synths/`. Juno presets are level-balanced by measurement only. Not committed or deployed.

Factory-patch formats, 20 October 2026: the Prophet VS program and wave SysEx are decoded (`docs/VS_SYSEX_FORMAT.md`). The Jupiter-8 tape decoder now handles real-world recordings and checks every patch's checksum (`docs/JP8_TAPE_FORMAT.md`). The Prophet-5/10 Rev 4 program SysEx is decoded too (`src/synths/prophet/sysex.js`, `docs/P5_SYSEX_FORMAT.md`). That gives the Prophet-5 page an import shelf and the 40 original Rev 3 programs as a yardstick before its engine exists.

**Private, not part of the public site.** It's for learning how these instruments work and for playing, not a service for others. `npm run build` includes it in `dist/` for the local and tablet preview. `npm run deploy` publishes `dist-public/` instead: built with `vite build --mode public`, which leaves out the /synths pages and engine. `tools/checkPublicBuild.mjs` refuses the deploy if any synth page, engine file or code reaches it. Factory patch data stays out of the repo too: banks are imported in the browser, and the YAML exports in `patches/` are git-ignored.

**Your banks, local only.** Put factory banks in the git-ignored `banks/<synth>/` folders (`juno-106`, `jupiter-8`, `prophet-5`, `prophet-vs`, `dx7`, `oberheim-ob-xa`; `.syx`, `.wav` and `.json`). The dev and preview servers serve them at `/local-banks/` with an `index.json`, and a local `npm run build` copies them into `dist/local-banks/`, so any static server of `dist/` has them. Pages read them through `src/synths/localBanks.js`: the Juno bank shelf lists them and loads the factory bank by itself when the browser has none stored. The public build leaves them out, and `tools/checkPublicBuild.mjs` refuses a deploy containing `local-banks/` or any `.syx`.

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

### Juno-106 (built)

Per voice: DCO (saw and pulse switches, manual or LFO pulse width, sub-octave square phase-locked to the DCO, noise) → HPF (bass boost / flat / ~240 Hz / ~720 Hz) → resonant 4-pole low-pass (self-oscillates at the top, loses some bass as resonance rises) → VCA (envelope or gate). One linear-attack ADSR drives filter and amplifier (positive or inverted for the filter). One triangle LFO with a delay that restarts at the start of a phrase. BBD chorus I (0.51 Hz), II (0.86 Hz), I+II (9.75 Hz, shallow), with band-limited wet path and optional hiss. DCOs don't drift; filters/amplifiers vary a little per voice ("Voice spread"). Additions for piano playing: velocity → VCF/VCA, touch pad pressure → VCF, bend amounts to DCO/VCF, mod → vibrato. Interpretations: the HPF corner frequencies and the BBD rates/depths are approximations of published figures, not measurements.

### Factory sounds as a quality yardstick

**Juno-106: imported banks (`src/synths/juno/sysex.js`, `BankBrowser.jsx`).** The "106 bank" shelf loads any Juno-106 SysEx file (the factory bank is 128 × 24-byte patch dumps, 3 KB) from a file or a link, keeps it in that browser's storage, and browses it with A/B · bank 1–8 · number 1–8 buttons plus ◂ ▸ stepping. No patch data is bundled with the site (Roland sells the factory set as "The Original 128"); only the decoder and the factory patch names are. Imported patches play as the hardware: velocity/pressure routes off, no reverb.

- Format: slider order and the button/switch bits follow the JAMRouter Juno-106 notes (williamweston/jamrouter `doc/juno-106.txt`); the two HPF bits are read as plain binary (3 − value), as the KR-106 project does, because one published table implies the opposite order. Organ patches decoding to gate mode confirm the switch-bit order. Names: the factory list republished on hinzen.de / synthmania.
- Calibration (`CALIBRATION` in `sysex.js`, one place): Roland's published end points for envelope (A 1.5 ms–3 s, D/R 1.5 ms–12 s) and LFO (0.1–30 Hz, delay 0–3 s). Estimated, to be tuned against recordings: envelope curve shape (mostly cubic with a small linear term so short settings stay usable), filter range (~6 Hz–24 kHz, 12 octaves, keyboard tracking counted from the lowest key), 10-octave envelope depth (engine change; the 12 Juno presets were rescaled to sound the same), VCA level slider as −20…0 dB (factory patches sit at 0 yet sound), DCO LFO depth.
- Engine changes found by the bank: HPF now matches published figures (+3 dB shelf at 70 Hz; 6 dB/oct one-pole cuts at 225 and 700 Hz); a self-oscillating filter starts each voice already ringing (otherwise short "ping" patches such as A82 Resonance Funk were silent); resonance fades as the cutoff is pushed past ~0.3 × sample rate (otherwise wide-open resonant patches whined at the clamp).
- Audit: `npx vite-node tools/auditJunoBank.mjs <bank.syx> [--wav dir]` renders every patch (held triad) with level/peak/brightness; with the factory bank all 128 are finite, median −30 dB, the quietest being very short percussive patches (Hand Claps, Pizzicato, Shaker), which may still be too quiet/dark.
- Next: compare against recordings of the real patches. Single held notes per patch allow mostly automatic fitting of the filter curve, envelope shape and levels; musical demos only allow by-ear comparison.

**Prophet-5: Sequential's own bank (`src/synths/prophet/sysex.js`).** Sequential gives the Rev 4 factory programs away as SysEx (200 programs). Factory bank 5 is the original 1978–80 Rev 3 set: BRASS, SYNC II, PULSE WIDTH MOD and so on. Every panel control decodes. Two things are still estimates or extrapolations: physical units for cutoff, envelopes and LFO (to be fitted by ear or from recordings), and the top of the Osc B low-frequency rate table. Import works like the Juno's: the player loads the file, nothing is bundled.

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

**Start from the generator's FM kernel, as a copy.** `synth-engine/fm` already has the parts that are hard to get right:
- 6 operators with a free routing matrix and carriers (enough for all 32 algorithms)
- two-sample averaged feedback (the DX7's own trick)
- ratio/fixed frequencies, 2×/4× oversampling with a decimating FIR, 32 voices, sample-timed events

It is *not* a DX7. Its envelopes, level/rate scaling, LFO and output stage are its own. The plan is to copy the operator core into `synth-engine/classics/src/dx7.rs`, then replace those parts with DX-accurate ones. The generator's kernel is not changed, so the music generator can't regress.

**The classic sounds are Yamaha's ROM cartridges.** The DX7 shipped with ROM1A/1B; ROM2–4 followed, 32 voices each: E.PIANO 1, BASS 1, BRASS 1, TUB BELLS, MARIMBA, HARPSICH 1 and so on. They are SysEx cartridge dumps (`F0 43 00 09 20 00` + 4,096 bytes + checksum + `F7`, 128 packed bytes per voice), widely available. The same import shelf handles the community's cartridge collections and generated ones (e.g. thisdx7cartdoesnotexist.com). Nothing is bundled.

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
2. **Oscillator extensions**: polyBLEP hard-sync reset at fractional time, polyBLAMP triangle, divide-down sub, DCO mode (no drift) and through-zero-safe linear FM input.
3. **Optional 2× oversampling** of the oscillator→filter path with a half-band decimator, switched on only when sync/cross-mod/poly-mod is active (the FM kernel already has a decimator to learn from).
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

## Plan

1. **Listen and tune the CS-80 on the tablet** (done: the one-page layout came out of this). Check feel first (velocity curve, touch-pad and auto-touch defaults, ribbon range, latency), then each preset by ear. Record voice counts/peaks from the header meter while playing with the pedal down.
2. **Shared DSP pass**: 4-pole filter, oscillator extensions and optional oversampling, each with focused tests and a spectrum/alias audit in `tools/`.
3. **Juno-106** (built 19 October; listen next, especially the filter sweep, resonance whistle and chorus modes).
4. **Prophet-5**: sync, poly-mod, unison and oversampling.
5. **Jupiter-8**: layers/split, assign modes and arpeggiator on top of everything above. Tape-WAV import is ready.
6. **Minimoog Model D**: mono voice path, 3 VCOs, overdriven ladder. A good test of the filter on its own, since nothing else masks it.
7. **OB-Xa**: mostly assembly by then (2-pole/4-pole filter, sync, split/double). Its character is in the filter and the brassy envelopes.
8. **Prophet VS**:
   - ~~program SysEx decoder, user-wave decoder, wave loading from the WAVs, YAML export~~ (done 20 Oct)
   - then the wavetable oscillator, vector mixer (fit the mix formula to the sheet points) and mix envelope
9. **DX7**:
   - ~~cartridge SysEx decoder and YAML export~~ (done 20 Oct: `src/synths/dx7/sysex.js`, 32-voice bulks and single voices, checksum checked)
   - then the engine: the kernel copy plus MSFA-accurate envelopes, scaling and output
   - check ROM1A renders against reference renders
10. Along the way: MIDI learn and patch files, as soon as more than one synth exists.

Order 4–9 is a suggestion; the formats work so far means either the Prophet-5 or the Jupiter-8 can come next.

Each model is a Rust module in the same crate (one `classics.wasm`, about 20–30 KB per model; the DX7 may be larger). Split into per-model Wasm files only if download size starts to matter.
