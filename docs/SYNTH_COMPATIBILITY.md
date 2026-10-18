# Existing-voice compatibility

Updated 18 October 2026. The previous engine is the sound reference for existing presets. A replacement should preserve the instrument's identity, register, attack, decay, held body, motion and spatial character. A new engine having a larger feature set does not make a lossy parameter conversion faithful. Availability badges are not approval of sound parity.

## What this feedback uncovered

The original adapter started from a voiced synth init patch, silently added a fixed square sub even where the old sub was inactive, substituted sine for organ/hollow/other custom periodic shapes, omitted FM attack depth and the independent upper oscillator, and changed envelope shapes. Two-oscillator detuning was doubled. Secondary oscillators were unison-stacked where the original had just one. Modulation-effect rates/depths and echo tone were dropped, and chorus was applied in two places. Those were compatibility defects, not intentional sound-design improvements.

The corrected source path has normalized, band-limited tables for the original organ, hollow, choir, glass and reed shapes, plus a band-limited triangle for translated keys. Compatibility-only envelope modes preserve power-shaped decay/release and zero-attack sustain. Existing standalone recipes retain their prior defaults. Inactive subs stay inactive; active sine subs use their actual waveform/octave. The original two-voice detune range, main-only unison and independent secondary oscillator are restored. Band-pass centre gain and master high-pass resonance follow the old filter conventions. FM translations retain transient and sustained depth, their inharmonic ratio, and the independently detuned upper carrier. Small pitch transients remain approximated by a separate modulation envelope.

Effect mapping now carries chorus/flanger/phaser timing, depth, feedback, EQ frequency and echo tone; chorus is applied once. Wider supported chorus-rate and flanger-delay ranges avoid truncating Warm Organ and Chimes settings. Source-level calibration removes the former systematic reduction on simple keys/bells. This is not a claim of complete effect or limiter equivalence.

## What was missing from the picker

The five approved prepared-source recipes were stranded in the source-comparison tool. The labs now expose **Prepared felt keys, Prepared electric keys, Prepared guitar, Prepared harp and Prepared upright**, retaining their contact softness and source/body settings. Their PCM preparation runs in a Worker; native buffer players feed Wasm inserts/rooms. They are explicitly labelled **Prepared · new engine**, rather than claiming their source DSP runs in Wasm. Live first-note preparation is serialized, bounded and cancellable; early release, Panic and disposal cannot publish a late held note. Brightness, additive pitch bend, motion and level work on held notes. Pressure/texture are disabled for these sources. Cold uncached notes still require preparation; this is a device-latency listening check, not a claim of zero-latency arbitrary-note synthesis.

The five oscillator plucks also have separate **(classic)** choices. Existing physical piano/string choices remain available with the previous implementation; this pass does not silently apply the newer rounded excitation to those references. Rounded contact is an intentional, previously approved timbre change, retained as a distinct prepared variant. The catalog now contains 138 built-in patches/variants across ten categories.

## Remaining parity work

| Area | Current boundary / required follow-through |
| --- | --- |
| Rooms | FDN replaces the original named convolution impulses. This is an intentional performance architecture choice with an audible difference, now disclosed. Preserve an optional original-room path or build explicit room profiles and obtain listening approval; do not call the generic eight-second room a matched replacement. |
| Modulation effects | Chorus/flanger/phaser parameters are carried, but their original node topologies, mix laws, phase and feedback behaviour are not identical. Compare wet and dry separately. |
| FM sources | Non-sine carrier/secondary shapes, legacy unison and per-voice filtering are incomplete. The reported sine-based Haunted Celesta is covered; that does not certify all old FM patches. |
| Envelopes/tuning | AHDSR holds, non-power custom envelope shapes, non-standard octave/per-key tuning, fractional global tuning, larger pitch transients and some source tuning limits still need explicit support. |
| Other flat controls | Separate simultaneous straight/ping-pong delay chains, coloured/filtered noise, exact distortion/bit crushing, master-stage EQ/filter/limiter details and old portamento/morph/wander semantics are not fully equivalent. |
| Dynamics/stereo | Key/bell source levels are calibrated on a shared dry fixture; unison/pan/filter movement and limiter behaviour still need ensemble, register and velocity sweeps. Free-running native phases make a single waveform overlay an inadequate match criterion. |
| Prepared sources | Original source DSP is retained; verify cold/warm latency, velocity changes, buffer budgets, long held/gliding notes and real MIDI/tablet sessions. Percussion kits remain in their existing tools/runner, not mapped to ordinary piano keys. |

Selected translated voices show known source/effect approximation notes. Keep the original engine as the default and available reference while this work remains. More preset-by-preset retuning must not hide missing features. Record a deliberate deviation with the original patch, reason, alternative patch/version and listening result.

## Acceptance workflow

1. Compare the same preset and note list in both engines: low/middle/high registers, soft/hard attacks, short notes, held notes, repeated notes, chords and transitions. Match seed/room conditions and compare levels before judging character.
2. First isolate dry sources, then inserts, delay, room and the complete musical context. Check pitch/partial ratios, envelope trajectories, motion rates, tails, discontinuities and clipping alongside listening. Use phase-insensitive measures for free-running oscillators.
3. Preserve standalone synth/FM parameter defaults and intentional voice-level drive when changing compatibility paths. The earlier translation-only correction was sample-identical in 132 standalone cases. The later chord-headroom correction below deliberately changes the common output stage, so current PCM is no longer identical to those preceding kernels; check low-level linearity, overload/recovery and musical character instead.
4. Run the full suite, source/artifact/cache-version checks and both browsers' development/production paths. Content-versioned Wasm/worklet URLs prevent an old cached kernel from interpreting new waveform IDs as a different sound.
5. Listen to actual presets and obtain device feedback before declaring a family matched. Finite, non-silent audio and close RMS are useful regression checks, not evidence that an instrument sounds good.

Local evidence is retained in the task work directory: `translation-{chrome,firefox}.json`, `translation-parity.mjs` and the preceding `translation-before-{core,fm}.wasm`. The browser dry fixture covers 13 reported voices in both engines, five prepared sources and live prepared input/cancellation. The unit regressions cover harmonic identity, unintended sub energy, zero-time sustain, legacy decay/release and band-pass gain. This pass remains part of Phase 5 compatibility/listening work; complete legacy parity and device/performance certification are not finished.


### Chord headroom correction — 18 October 2026

Two-note Organ Whistle feedback exposed an always-on output saturation curve in the subtractive and FM sums and again on the effects return. This adds intermodulation even below digital full scale. Replaced those output curves with shared stereo-linked peak gain protection: unity below a 0.98 sample ceiling, immediate reduction for overload, 50 ms hold and 120 ms recovery. It allocates no render-loop storage and adds no look-ahead latency. FM protection follows the reconstruction FIR/DC filter, avoiding the former pre-FIR saturation and post-FIR hard clip. Intentional oscillator/filter drive and insert distortion remain. Native-engine dynamics and the final multi-instrument destination sum are unchanged; this is not true-peak or full master-bus protection.

The change applies to standalone recipes as well as translated voices. Their parameter defaults are retained, but the unwanted output coloration is intentionally removed; do not reuse the preceding sample-identical-PCM claim. Source-artifact hashes now include common/headroom.rs and versioned browser assets update with each rebuild. Panic/clear reset the protection state. Recovery tracks reduction towards zero to avoid f32 gain recovery stalling near unity at high rates.

Validation: 801 tests / 121 files and production/source-artifact/cache checks pass. Regression fixtures cover organ/bell chord linearity with matching note IDs, dense 32-note core/FM chords, stereo linking, quiet effects-return identity, recovery/reset, callback-size determinism and rates through 192 kHz. In the hard-velocity C4/E4 Organ Whistle fixture, best-fit summed-note residual improves from about -43 dB to -125 dB relative to the chord (source-only, not a subjective approval or a room-match claim). Chrome and Firefox each pass 16 complete two/eight-note organ/bell renders with dry/wet effects and a live Organ Whistle chord; final lab outputs remain below 0.687. Core/FM/effects artifacts are 307,441 / 90,238 / 60,126 bytes. Existing ambience chunking warning remains; no new device-performance certification.

Phase: Phase 5 compatibility/listening remains in progress. Remaining: wet-room/modulation character, incomplete legacy source/control mappings, broader register/velocity/ensemble listening and device performance; final ensemble/master gain staging also needs its own validation. Direct next step: reload the local lab and re-audition Organ Whistle chords at the original playing velocity, then continue the reported instrument comparisons. Local only; no deployment.
