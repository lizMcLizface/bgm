# Matching our synths against the installed VSTs

`npm run vst:match` renders notes on real VST3 synths headlessly (Python + pedalboard), renders the same
note on our engine, and measures the difference (`compareReferences`: gain, pitch, envelope and spectral
error, plus the worst bands). It can also fit our parameters to a VST render. This is the reference
recording source that [SYNTHS_MATCHING.md](SYNTHS_MATCHING.md) was missing.

| Our model | VST | State |
|---|---|---|
| FM7 `dx7` | Dexed | **Exact twin**: a Dexed program IS a DX7 voice, mapped both ways (`pairs.mjs`, round-trip tested) |
| V 80 `cs80` | UNSTABLE | baseline sweep only (`cases/cs80-basic.json`) |
| Pluto 8 `jupiter8` | EightyEight (parametric), Deep Jupiter (8 programs, 25 knobs) | baseline sweep only |
| Oberon Xa `obxa` | OB-Xd 3 | baseline sweep only |

| Oracle 5 `prophet5` | UADx PolyMAX Synth | a Prophet-style poly-mod polysynth (a software model, not hardware); see the Oracle 5 section |

Analog 106 and Mercury D are lower priority (analogue, better hardware grounding, and judged not far off by ear); VectorVS, the TB-303 and the drum machines have no VST here.

## Setup (once)

```sh
uv venv .tmp/vst/venv --python 3.12
uv pip install --python .tmp/vst/venv/Scripts/python.exe pedalboard numpy scipy mido
```

`.tmp/` is git-ignored. Plugins load from `C:/Program Files/Common Files/VST3` (table in `tools/vst/vsthost.py`).
Dexed and OB-Xd only load through their inner `Contents/x86_64-win/*.vst3` file.

## Commands

```sh
npm run vst:match -- params <plugin|pair> [regex]          # parameter table: range, step, enum text, program names
npm run vst:match -- twin dx7 [--programs 0,5|all] [--note 60 --velocity 100 --hold 1 --tail 1.5]
npm run vst:match -- cases tools/vst/cases/<file>.json [--fit] [--only prefix,prefix]
```

Output goes to `.tmp/vst-match/<run>/`: `vst/<plugin>/*.wav`, `ours/*.wav` (listen to both), `report.md`, `report.json`
(full patch values and fit history). Pass `--run name` to keep runs apart.

* **gain dB**: what our synth needs to match the VST (positive = ours is quieter). Everything else is measured
  after that one gain, so level and shape are not mixed up.
* **harm dB** is the timbre error that matters for pitched notes: the level of every harmonic of the note (floored at -60 dB, after removing the overall gain), so noise floors, drift and inter-harmonic content do not count. `spec dB` (1/6-octave bands) includes them, and the VST's own jitter alone can add 6-8 dB to it.
* **pitch ct** is unreliable on filtered or inharmonic sounds (octave errors; an exact 1200 is usually that).
* **held / rel** repeat the metrics for the last 0.3 s of the held note and for the release tail.

### Case files

`{pair, defaults, cases:[{name, ours:{our keys}, vst:{program, params}, fit:[our keys], window:[from,to], note, velocity, hold, tail}], sweeps:[...]}`.
`window` (seconds) restricts the fit's score to that part of the note.
VST params are native numbers, `{"norm": x}` (raw 0..1, the only way to set an enum without its text) or
enum text. Every case starts from the plugin's load state, then program, then params. If `vst` is omitted
and the pair has `toVst` (dx7), the VST patch is generated from `ours`.

A **sweep** steps one VST knob (`vstParam`, `norms`) over a base patch. With `--fit`, `fit` lists our
parameters to optimise (coordinate search, log-scaled where the parameter is), so the printed
`fit name@norm: ... cutoff=...` lines are that knob's response curve in our units, and the remaining cost
says whether our synth can sound like it at all.

## Findings (2026-11-03, first run)

**FM7 vs Dexed, all 32 factory voices** (note 60, velocity 100, LFO and oscillator phase locked to the note
start in both): 18 of 32 within 3 dB spectral error and 50 cents (24 within 5 dB); mean level offset +5.8 dB (our default
`volume` .6 is quiet; constant, so just a gain). Feature probes (`cases/dx7-features.json`) show matching:
ratios, coarse 0, fine, fixed 100 Hz / 1 kHz, 2-op FM, key-scale, rate-scale basics, high and low notes.
Differing, all unexplained so far:

* **pitch envelope**: `pitch-eg` (L1=70) 11 dB spectral error, +30 dB at 320-400 Hz.
* **LFO pitch depth**: `pms-lfo`, `lfo-delay` -75 / -88 cents and 7-8 dB; **amp mod**: `ams-lfo` 25 dB envelope error.
* **envelope tails**: `env-fast-decay` 21 dB, `rate-scale7-hi` 11 dB, release segment errors of 10-25 dB even on a
  plain sine (our release vs Dexed's), velocity 127 release 23 dB.
* voices 03, 07, 09, 10, 15, 26 are 15-40 dB off. 15 FLEXI 4 uses fixed-frequency operators with fine;
  09 / 26 use amp-mod depth; 10 has coarse-0 operators with fine.
* Dexed is in "Modern (24-bit)" engine mode; the DX7's own 12-bit DAC/rounding is not what we compare to.

**Envelope calibration** (`cases/*-env.json`, made by `tools/vst/genEnvCases.mjs`; sweeps with `--fit` and a
`window` so each fit only scores its own segment). VST knob position -> our time (seconds, our exponential time
constant), amp envelope, filter wide open:

| knob | .2 | .35 | .5 | .65 | .8 |
|---|---|---|---|---|---|
| OB-Xd attack -> `aAttack` | .18 | .15 | .32 | .78 | 2.3 |
| OB-Xd decay -> `aDecay` | .076 | .19 | .44 | 1.08 | 3.4 |
| OB-Xd release -> `aRelease` | .073 | .19 | .43 | 1.06 | 3.3 |
| UNSTABLE `vca1_attack_s` -> `i.a` | .25 | .54 | 1.04 | 1.8 | 2.7 |
| UNSTABLE `vca1_decay_s` -> `i.d` | .084 | .27 | .60 | 1.12 | 3.1 |
| UNSTABLE release -> `i.r` | .064 | .23 | .49 | .90 | 1.4 |
| EightyEight `env2_attack` -> `e2Attack` | .19 | .33 | .63 | 1.07 | 1.72 |
| EightyEight `env2_decay` -> `e2Decay` | (<.001) | (<.001) | .14 | .58 | 3.2 |
| EightyEight `env2_release` -> `e2Release` | .28 | .96 | 3.3 | 7.4 | (>10) |

(The OB-Xd attack row is noisy: the first three fits stay near the minimum; trust .65 and .8.) Decay and release
agree for OB-Xd, as they should. Using the matched release in the OB-Xd cutoff baseline took its envelope error from
46 dB to 0.9 dB and its release segment from ~65 dB to ~1 dB; what was left there (6-8 dB of band error) turned out to be the VST's inter-harmonic noise floor, not timbre: see the harmonic metric below.

Oddities that blocked the first pass, now explained:
* **UNSTABLE and EightyEight start a phantom note 60** on their first block, even with no MIDI at all (-13 and -19 dB
  RMS), and never release it unless a note-off for 60 arrives. This was first misread as "two voices per note and one
  note-off releases only one" (a second note-off silenced the tail because it released the phantom). The host now
  sends a note-off for 60 at t=0 for those two plugins (`PHANTOM_NOTE_OFF`; a case can keep it with `phantom:true`).
  Everything measured on them at a note other than 60 before this fix carried a stray sustained C4, and was redone.
* **UNSTABLE's -48 dB drop at note-off** was the baseline: `vcf1_release_s` 0 closes the filter envelope instantly.
  Baseline now uses 5.
* **EightyEight's level wobble** was its LFO tremolo: `vca_lfo_mod` 0 leaves it ON, 100 turns it off (inverted
  versus the name). Baseline now uses 100.
* **Envelope shape differs, not just time.** UNSTABLE decay and release are linear in amplitude (a dB plot
  accelerates and then cuts off at zero); ours is an exponential, straight in dB, so one time constant cannot fit
  both ends and its release/decay fits cost 15-30 where EightyEight's cost 1-3. V 80 has `ampShape` 1 with
  `ampCurveA/D/R`; fitting those together with the time (`cases/cs80-env-curve.json`) cuts the cost (decay .2: 275
  to 12; release .5: 87 to 9) but the two-parameter coordinate search is jumpy, so no table for it yet.
* EightyEight's release above ~3 s cannot be resolved with a 3 s tail; its longest rows are lower bounds.

Not calibrated:
* Filter cutoff curves (from the earlier cutoff sweeps, before the fit bug below was fixed, so redo them):
  OB-Xd `cutoff` .5 / .65 / .8 / .9 -> 1.6 k / 4.4 k / 12.8 k / 19 kHz.
* Deep Jupiter exposes only program, cutoff, LFO, effects: use it as a listening / spectral reference for Pluto 8
  programs, not as a parameter twin.

## OB-Xd vs Oberon Xa: spectral calibration (2026-11-03)

Harmonic error (`cases/obxa-spectral.json`, `-keyfollow.json`, `-noise.json`; single saw unless noted, `--fit`):

| Test | Result |
|---|---|
| Open filter, harmonic levels | identical (h1..h4 0 / -7 / -12 / -18 dB on both); our oscillator matches |
| 2-pole filter, cutoff and resonance | 0.2-0.7 dB harmonic error. Resonance VST .2 / .5 / .8 -> ours `res` .26 / .46 / .70 (about 1:1) |
| 4-pole filter, cutoff | 1.4-1.8 dB, but ours is 4-8 dB too high deep in the stopband (h14-h18, 55-68 dB down): our 4-pole slope is shallower far out |
| 4-pole resonance | VST .2 / .4 / .6 / .8 / .95 -> ours `res` .19 / .33 / .38 / .56 / .56: compressed above .6, fit error 3-5 dB vs 0.4 for 2-pole; at .95 ours peaks 19 dB too high at h7 (the VST barely resonates). This is the "estimated resonance ceiling" in SYNTHS_MATCHING.md |
| Pulse width | one-to-one: VST .1 / .3 / .5 / .7 / .9 -> ours `pw` .10 / .31 / .51 / .72 / .94 |
| Filter envelope amount (sustain 1) | VST .2 / .4 -> ours `envAmount` .25 / .46 (about x1.15-1.25); from .6 up both filters are fully open (ours pins at 1.0) |
| Key follow | slope matches: VST at 1.0 tracks 1.95x per octave (cutoff 393 / 746 / 1447 / 2785 / 5399 / 11090 Hz for notes 36..96), ours `track` 1 is the same slope. **Pivot differs**: ours counts from C2 (note 36, `obxa.rs`, on purpose for a 61-key keyboard), OB-Xd from middle C, so identical settings differ by 2 octaves of cutoff at note 60 (ours would need `cutoff` 355 for the VST's 1447 at track 1) |
| Noise | **colour and level differ**: VST noise rises about +3 dB per octave (-35 dB at 36 Hz to -12 dB at 6.4 kHz, a blue tilt), ours is flat; open-filter level +12 dB louder in the VST at its maximum; ours has only an on/off switch, no level |
| Oscillator 2 detune | not resolved: beating makes the harmonic and pitch metrics unreliable; needs a beat-frequency measure |

Not engine faults: the VST's inter-harmonic floor (-50 to -60 dB, drift or jitter), which is why `spec dB` looked
worse than the sound is.

### Engine changes made from this (`synth-engine/classics/src/obxa.rs`, kernel rebuilt)

* **Noise is white** (was Kellet pink). OB-Xd's noise is flat in Hz; the old source was flat in log bands, i.e. tilted
  the wrong way. Level: about the plugin's half-knob level (-38.5 dB RMS noise-only), within 1.5 dB of the old
  loudness. The plugin's maximum is 14 dB hotter than that, but our control is a switch, so presets with noise keep
  their balance. After the change the noise-only spectrum matches the VST at half knob within ~1 dB per band.
* **Four-pole resonance taper**: `feedback = 3.9 (0.55 r^0.7 + 0.45 r^40)`. Our res that matches the plugin's knob
  .2 / .4 / .6 / .8 / .95 was .19 / .34 / .38 / .50 / .56 (flattening), so the old linear control was 1.5-2x too
  resonant above the middle. Refit: .23 / .44 / .60 / .78 / .78. The steep r^40 term keeps the near-oscillating end.
  The two-pole damping was already 1:1 and is untouched. Presets with `res` above ~.3 on the four-pole filter
  now resonate less than before (Oberon Xa presets were already judged "off", see classic-synth-quality).
* Tests added in `obxa.test.js` (noise tilt, resonance monotone and below self-oscillation).

### Left alone, on purpose

* **Key-follow pivot** (C2 here, middle C in OB-Xd): left alone at first, changed in the Oracle 5 pass below once presets were confirmed unused on the main page.
* **Four-pole stopband**: ours is 2-6 dB higher at harmonics 12-20 for a 1.6 kHz cutoff (55-45 dB below the fundamental;
  within 1 dB at 4.4 kHz and above). Not the input saturator (tested by removing it: no change); cause not found,
  small enough to leave.
* **Noise maximum level** (above).

## Pluto 8 vs EightyEight, V 80 vs UNSTABLE: spectral pass (2026-11-03)

Files: `cases/jupiter8-spectral.json`, `cases/cs80-spectral.json`. Fits score only the steady part of the note
(`window` .3-1.4 s) by harmonic error. Two traps found on the way, both baseline errors worth remembering:
**EightyEight's `vcf_slope` is inverted against its name** (norm 0 = steep 24 dB/oct, norm 1 = the default,
gentle 12 dB), and **UNSTABLE's `osc*_pwm_depth` defaults to 1**, so its square wave breathes unless zeroed.

### Pluto 8 (jupiter8) vs EightyEight

| Test | Result |
|---|---|
| Saw oscillator, open filter | 0.5 dB harmonic error |
| Filter response, 24 dB mode | within 1 dB at every harmonic (checked at knob .65 and .8). Cutoff: VST .3 / .5 / .65 / .8 / .9 / 1 -> ours `cutoff` 188 / 665 / 1801 / 4675 / 9739 / >17k Hz |
| Filter response, 12 dB mode | within 1 dB. VST .4 / .6 / .8 -> ours 333 / 1200 / 5245 Hz (about 12 % above the 24 dB mode's corner at .8) |
| Resonance | peak gain about 1:1: VST .2 / .4 / .6 / .8 / .95 = 4.7 / 10.2 / 11.2 / 14.8 / 18.4 dB, ours `res` .2 / .4 / .5 / .8 / 1 = 4.7 / 10.5 / 11.3 / 14.0 / 15.3 dB. Ours tops out about 3 dB under the VST's top end |
| Filter envelope amount | linear with a dead zone: ours `envMod` = 0.59 x (knob - 0.2): .12 / .24 / .35 / .47 at knob .4 / .6 / .8 / 1 |
| VCO mix (VCO 2 an octave up) | ours `sourceMix` .58 / .69 / .82 / 1.0 at knob .25 / .5 / .75 / 1 (residual 2.4-3.3 dB: fine tuning of the two oscillators) |
| Pulse width | pulse duty is a straight line in the knob (0.463 - 0.45 k); ours is 0.5 - 0.45 pw, so ours `pw` = knob + 0.08. The plugin's square is 48.8 % duty (even harmonics at -28 dB; ours is exact, -119 dB) |
| VCO 1 waveform selector | VST: sine / saw / pulse / square / noise. Ours VCO 1: Tri / Saw / Pulse / Square. Saw and square agree; **ours has no VCO 1 sine or noise, the plugin no triangle** |
| Key follow, high-pass | the plugin's `vcf_key_follow` and `hpf` have no effect at any setting tested (identical renders at four settings; cutoff is flat across notes 48-96); nothing to compare |

Engine change made from this: VCO 1 now also offers **Sine and Noise** (`vco1Wave` 4 / 5; saw, sine and square within 0.2 dB of the plugin's level, noise 3.4 dB under the saw as in the plugin). Tests added in `jupiter.test.js`.

Not measured: sync.

### V 80 (cs80) vs UNSTABLE

Redone after the phantom-note fix (an earlier version of this section reported a low-pass shape mismatch that was the
phantom's constant C4 under the note: retracted).

| Test | Result |
|---|---|
| Saw, open filter | 1/h saw (0 / -7 / -10 / -13 dB). The plugin's "fully open" low-pass still equals ours at about 8 kHz (a gentle roll-off above 1.5 kHz) |
| Low-pass cutoff and shape | matches: 0.9-1.3 dB harmonic error at every knob position, 12 dB/oct. The curve is exponential, a doubling every 0.05 of the knob: VST .7 / .75 / .8 / .85 / .9 / .95 / 1 -> ours `i.lpf` 154 / 290 / 547 / 1053 / 2068 / 4272 / 8229 Hz |
| Low-pass resonance | measured with noise through the filter (the fit-based reading was a cutoff trade-off): the plugin does nothing below .5, then 1.4 / 5.0 / 11.9 / 20.1 / 24.0 / 27.4 dB at .6 / .7 / .8 / .9 / .95 / 1; ours was linear (14.8 dB at .6). **Fixed** with a taper (below) |
| High-pass | 12 dB/oct on both. VST .3 / .5 have no effect, .7 -> ours `i.hpf` 87 Hz, .9 -> 1264 Hz (fit error 3-5 dB) |
| Pulse width | VST native 50 / 62 / 75 / 87 / 99 % -> duty .50 / .38 / .25 / .13 / .03; ours `i.pw` is symmetric about .5, so **`i.pw` = native % / 100** exactly |
| Key response (+100 %) | the plugin's cutoff rises about 1.6-2.3x per octave (ours `i.lpf` equivalents 109 / 250 / 870 / 1467 / 2319 Hz at notes 36 / 48 / 72 / 84 / 96); our `i.keytrack` was not compared |
| Sine mix, square level | the fits run to our maximum with no useful curve (levels not calibrated) |

## Modulation pass (2026-11-03): LFO, PWM, cross-mod

`npm run vst:mod -- tools/vst/cases/<spec>.json` (`tools/vstMod.mjs`, `tools/vst/modulation.mjs`): frames the held note
(32-64 ms every 5-10 ms), tracks pitch, level and spectral centroid, and reports each series' peak-to-peak depth and
dominant rate. A depth test finds the value of our parameter that gives the plugin's depth at each knob position by
interpolation; a rate test reads off the plugin's Hz. The pitch tracker is reliable up to about 200-300 cents of
vibrato; deeper readings in the output are tracker failures, not data. Specs: `cases/jupiter8-lfo*.json`, `cases/cs80-lfo*.json`.

### Pluto 8 vs EightyEight

| Test | Result |
|---|---|
| LFO rate | exponential: knob .6 / .65 / .7 / .75 / .8 / .85 / .9 -> 0.40 / 0.78 / 1.5 / 2.8 / 5.1 / 8.9 / 15 Hz (below .5 it is under 0.1 Hz, unresolved); ours `lfoRate` is in Hz so use these directly |
| Vibrato depth | quadratic in the knob on both: plugin = 4650 cents x knob^2; ours was 2360 cents x `vcoModLfo`^2, half the plugin's per number (46 against 24 semitones at full depth). **Fixed**: ours now equals the plugin's knob |
| Filter LFO depth | monotone, roughly ours `vcfLfo` = 1.3 x knob at the low end (.1 / .2 / .4 / .6 -> .12 / .27 / .51 / .86); both saturate when the filter sweeps the whole range |
| Tremolo | the plugin's `vca_lfo_mod` is a switch, not a depth: below .5 full-depth tremolo (25.8 dB peak-to-peak), above it none. Ours had steps 0-3 = 0 / 3.3 / 7.8 / 16.7 dB; the top step is now about 26 dB |
| Cross-mod | the plugin's fundamental itself rises with the knob (265 / 270 / 283 / 478 / 844 Hz at .15 / .2 / .3 / .5 / 1), the signature of deep exponential (1 V/octave) FM, not linear sidebands; depth about .3 / .5 / .8 / 2.1 / 3.6 octaves at .15 / .2 / .3 / .5 / 1. Our linear index never matched; replaced (see below) |

### V 80 vs UNSTABLE (LFO shape 1, the clean one; shape 0 is irregular)

| Test | Result |
|---|---|
| LFO rate | knob .06 / .08 / .1 / .15 / .2 / .25 / .3 / .4 -> 0.13 / 0.18 / 0.36 / 1.1 / 2.4 / 4.5 / 7.4 / 16 Hz; ours `subRate` in Hz |
| Vibrato | quadratic: VST `lfo_to_vco` .1 / .2 / .3 = 46 / 148 / 298 cents; ours `subVco` that matches = .23 / .75 / 1.5 (about 17 x knob^2 semitones; our `subVco` makes 197 cents per unit) |
| Filter LFO | VST `lfo_to_vcf` .1 / .2 / .4 / .7 / 1 -> ours `subVcf` .12 / .31 / .71 / 1.5 / 2.8 octaves |
| Tremolo | VST `lfo_to_vca` .1 / .2 / .4 / .6 / .8 (1.7 / 2.7 / 5.2 / 8.7 / 14.7 dB) -> ours `subVca` .16 / .26 / .46 / .64 / .81; at 1.0 both go to deep nulls |
| PWM speed | VST `osc1_pwm_speed` .05 / .1 / .2 / .3 / .5 / .7 -> 0.12 / 0.24 / 1.7 / 5.0 / 10 / 25 Hz; ours `i.pwmRate` stopped at 12 Hz, now 30 Hz |
| PWM depth | weak at low settings: VST `osc1_pwm_depth` .25 / .75 / 1 -> centroid swing .06 / .20 / .61 octave, ours `i.pwm` .055 / .17 / .43 |

Also checked: the earlier envelope tables hold on the corrected host (EightyEight identical; UNSTABLE decay and
release identical, attack about 10 % longer, updated above).

### Engine changes made from the spectral and modulation passes

Presets are not used on the main page, so these retune the V 80 and Pluto 8 sounds without compensation elsewhere
(the four V 80 presets that lost resonance had their `volume` raised to keep their level; the level-spread test passes).

| Change | Where | Verified |
|---|---|---|
| Pluto 8 VCO 1 gains **Sine and Noise** (`vco1Wave` 4 / 5) | `jupiter.rs`, `jupiter/params.js` | levels within 0.2 dB (noise 3.4 dB under the saw, as in the plugin) |
| Pluto 8 **vibrato depth x1.94** (12 -> 23 semitones at full) | `jupiter.rs` | `vcoModLfo` now equals the plugin's knob: .05 / .1 / .2 -> .049 / .101 / .202 |
| Pluto 8 **tremolo steps** 0 / .2 / .45 / .8 -> 0 / .2 / .55 / .955 | `jupiter.rs` | top step swings about 26 dB like the plugin's on state; middle step about 10 dB |
| Pluto 8 **cross-mod is exponential FM** with depth from a measured table (0 -> 3.6 octaves) | `jupiter.rs` (`cross_mod_octaves`) | the fundamental's rise matches at knobs .15 / .2 / .3 (268 / 270 / 283 Hz vs 265 / 270 / 283) and fitted `crossMod` equals the knob from .02 to .15 |
| V 80 **low-pass resonance taper** (nothing below .5, then 1.4 / 5 / 12 / 20 / 24 / 27 dB at .6 / .7 / .8 / .9 / .95 / 1) | `cs80.rs` (`lp_resonance`) | noise-peak gain within 0.4 dB of the plugin up to .95 (26.5 vs 27.4 dB at 1) |
| V 80 **PWM speed range** 12 -> 30 Hz | `cs80.rs`, `cs80/params.js` | covers the plugin's upper half (25 Hz at its .7) |
| V 80 presets Night Choir, Funky Clav, Deep Bass, Sweep Pad: `volume` raised | `cs80/presets.js` | levels back within the old 5.2 dB spread |

New tests: `jupiter.test.js` (vibrato depth, tremolo swing, cross-mod pitch rise), `classics.test.js` (resonance taper).

Still different: **cross-mod above about .3** (the plugin's carrier stays a clean harmonic series at the raised pitch,
ours becomes sidebands, because our modulator is a free-running oscillator), the **V 80 resonance** `lpRes` below .5
now does nothing (as in the plugin), and everything not measured (sync, Pluto 8 high-pass, which the plugin ignores).

## Oracle 5 (prophet5) vs UADx PolyMAX (2026-11-03)

Files: `cases/prophet5-spectral.json`, `-spectral2.json`, `-env.json`, `-lfo-rate.json`, `-lfo.json`. PolyMAX loads through
its inner `Contents/x86_64-win/uaudio_polymax.vst3` and has no phantom note. Its oscillator shape is a morph: 0 triangle,
.25 saw, .5 square, then .625 / .75 / .875 / 1 = pulse of duty .37 / .25 / .13 / .02. Its LFO routes to pitch and filter
through `pitch_mod` / `filter_lfo_amt` (set `pitch_mod_source` to LFO; it defaults to the envelope).

| Test | Result |
|---|---|
| Saw, square | harmonic error 0.8 / 1.0 dB |
| Filter, 4-pole low-pass | fit cost 0.1-1.0 on all three of our filter revisions (rev 1 and 2 marginally best). Cutoff is exponential: knob .3 / .45 / .6 / .75 / .9 / 1 -> ours 119 / 382 / 1235 / 4258 / 13960 / >20k Hz |
| Filter, 2-pole and other modes | did not match (fit cost 1.5-4): ours had no 2-pole mode nor BP / HP / notch. **Added** (below) |
| Resonance (4-pole) | about 1:1 up to .8: knob .2 / .4 / .6 / .8 / .95 -> ours `res` .22 / .44 / .66 / .89 / .90 (0.6-1.1 dB cost) |
| Pulse width | duty = 0.5 - 0.96 x (knob - 0.5); ours duty = `aPw` (symmetric about .5), so **`aPw` = that duty** |
| Osc B saw and triangle | match (cost under 1 dB). The plugin's osc A also has a triangle and a morph between shapes; ours had saw and pulse switches on A (a triangle switch added, the morph left out) |
| Mix knobs (osc 1, osc 2, noise) | linear in amplitude on both (.5 = -6 dB, .1 = -20 dB); same taper, no change needed |
| Noise | the plugin's **white** noise has the same spectrum as ours within about 2 dB, and sits 1.1 dB under a full oscillator (ours 2.1 dB). **Pink** (the plugin's default) had no counterpart in ours: added (below) |
| Filter envelope amount | ours `fEnv` = 0.0112 x amount %, i.e. knob .55 / .6 / .7 / .8 -> .115 / .22 / .45 / .69 (both saturate when the filter is open) |
| Key follow (100 %) | slope matches (2.0x per octave, 12 dB/oct tracking); **pivot differed**: the plugin keeps the cutoff at note 60, ours counted from note 36 (C2), two octaves apart. Moved to note 60 (below), as for the Oberon Xa |
| Not matched in this pass | osc B fine detune and sync (beating defeats the harmonic metric; the plugin's `osc_2_sync` is a 0-36 amount, not a switch), poly-mod FM, mod wheel, unison, arpeggiator |

Amplitude envelope (knob .2 / .35 / .5 / .65 / .8 -> ours seconds, shapes match, fit cost 0.8-1.3):

| Stage | .2 | .35 | .5 | .65 | .8 |
|---|---|---|---|---|---|
| attack -> `aAttack` | .032 | .22 | 1.1 | 5.5 | 17 |
| decay -> `aDecay` | .27 | 1.4 | 5.2 | 16 | 34 |
| release -> `aRelease` | .16 | .98 | 5.3 | 19 | 44 |

LFO: **rate is exactly exponential, Hz = 0.05 x 1000^knob** (.3 / .5 / .7 / .9 -> 0.40 / 1.6 / 6.3 / 25 Hz); ours `lfoRate` is in Hz.
Vibrato depth (plugin `pitch_mod`, knob .505 / .51 / .52 / .54 / .56 / .6 = 9.5 / 20 / 47 / 119 / 216 / 580 cents peak to
peak) -> ours `lfoAmount` .066 / .10 / .155 / .24 / .32 / .49 (ours is about 1950 cents x amount^2). Filter LFO
(`filter_lfo_amt` .55 / .6 / .7 / .8 -> centroid swing .65 / .81 / 1.9 / 3.4 octaves) -> ours `lfoAmount` .043 / .094 / .32 / .64.

### Engine changes made from the Oracle 5 pass (Oracle 5 and Oberon Xa)

The new controls are in the parameter table but **not on the panel** (the Oracle's normal controls are unchanged; their
defaults give the old sound), so the filter mode, pole count, noise colour and triangle are reachable from presets and links.

| Change | Where | Verified against the plugin |
|---|---|---|
| **Filter mode** LP / BP / HP / Notch and **poles** 2 / 4 (`filterMode` 72, `filterPoles` 73; defaults LP, 4-pole = the ladder as before) | `prophet.rs`, `prophet/params.js` | at zero resonance every LP / BP / HP, 2- and 4-pole response is within about 1-2 dB of the plugin's (corner of each stage at the cutoff: -6 dB for two poles, -12 for four; band-pass unity at the centre). Notch is a plain state-variable notch; the plugin's notch has no dip at zero resonance and is not matched |
| **Resonance of the new modes** fitted from tables (damping per knob position; two-pole low-pass passband 1/(1+k); band-pass gain) | `prophet.rs` (`D_LOW`, `D_HIGH`, `PASSBAND`, `BAND_GAIN`) | two-pole low-pass passband loss within 0.2 dB at every knob position; high-pass peaks within 1 dB. The state-variable section saturates, so low-pass / band-pass peaks stop about 5 dB short at the top of the knob, and the plugin's band-pass high side does not narrow with resonance (ours does) |
| **Ladder make-up gain `1 + 0.3 k` removed** | `prophet.rs` | the ladder's passband loss now equals the plugin's within 0.7 dB at every knob position (-5.6 / -9 / -11.4 / -13.3 / -14.7 dB against -6.3 / -9.9 / -11.9 / -13.5 / -14.8). Presets keep their level through `ladderMakeupVolume` (below) |
| **Pink noise** (`noiseColor` 74, default White) | `prophet.rs` | flat in octave bands, within about 3 dB of the plugin's curve, 2.4 dB under white (the plugin 1.2 dB) |
| **Osc A triangle** (`aTri` 75) | `prophet.rs` | harmonic error 0.4 dB against the plugin's shape 0 |
| **Key-tracking pivot C2 -> middle C**, Oracle 5 and Oberon Xa; cutoff range to 40 kHz so shifted sounds fit | `prophet.rs`, `obxa.rs`, both `params.js` | the fitted cutoff against the plugins now stays within about 20 % of the base across notes 36-96 (it was off by a factor of 4); the Oracle's and Oberon's default cutoff move with it (Oracle 750 -> 1500) |

**Presets**: every sound keeps the sound it had. `src/synths/pivot.js` shifts the cutoff by 2 octaves per unit of tracking
(after the old table's 20 Hz clamp) wherever values are authored or decoded against the old pivot: the hand-written
presets in `prophet/presets.js` and `obxa/presets.js`, `engineValues` in `prophet/sysex.js` (programs and patch sheets) and
`obxa/book.js` (the patch book). Compared with the committed build, the 109 Oberon presets are unchanged and the 50
Oracle presets are within 1 dB in level and 1.5 dB in brightness, except five (Resonant Pluck, Damped Clav, Tin Piano,
Chiff Pipes, Noise Wash) that are 3-5 dB quieter because their volume was already at its maximum. The Oracle's
volume is raised by `ladderMakeupVolume(res)` to make up the removed gain. Published banks `cs80`, `obxa`, `prophet5`
regenerated (the V 80 one had been stale since the earlier volume change).

Left as it was: the ladder's self-oscillation above resonance .87 (the plugin's low-pass never rings: its peak stops at
about 9 dB from .85 up), because the factory resonance sounds rely on it.

**Bug fixed during calibration**: `--fit` seeded its search with the model defaults, including `reverbMix` .25,
so every earlier fit scored a reverberant sound and the final render had reverb on. Fits now start from the case's own
values (dry). Earlier cutoff-fit numbers are void.

## Caveats

* The VSTs are not hardware. A VST agreeing with us shows consistency with that VST's model, not with the machine.
* Free-running LFO / oscillator phase makes two renders differ even when both are right; lock key sync (the Dexed twin
  does).
* Dexed's pedalboard readback is relative to the DX7 centre (pitch EG level 50 reads 0, transpose 24 reads 0) and the
  range metadata says 0..99; `pairs.mjs` applies the offsets.
* A fit can only move the keys it is given and stops at local minima; read the cost, not just the values. Each key is scanned over its range (11 points) before local refinement, because the cost has ridges (a dark filter against a bright one). Pairs of coupled keys (cutoff with resonance or envelope amount) trade off; pin one when you can.

## Surge XT (pair `wt`, Quadwave)
* Host quirks: Surge has a phantom note 60 (note_off at t=0, as UNSTABLE/EightyEight), needs a 0.6 s silent
  `SETTLE` block, and only parameters that differ from the base patch are restored.
* Filter, waveshaper and comb type changes do not take effect through the harness, so filters are not compared.
* Cutoff is exponential (13.75 Hz..25 kHz), not linear. Results are in `docs/WAVETABLE.md`.
