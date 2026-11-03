# Quadwave (`/synths/wt`, model id 12)

An original four-wave wavetable synth, built beside VectorVS (which stays). No Prophet VS reference exists
online, so Quadwave is grounded in Surge XT sound design instead and keeps the VS interface idea: four
editable single-cycle waves blended by a diamond joystick.

## Engine (`synth-engine/classics/src/wt.rs`)
* Four 2048-sample cycles in the shared wave buffer (`syn_wave_ptr` / `syn_wave_commit`, dispatched by model).
* `commit()` builds half-octave mip tables per slot (21 levels, 1024..1 harmonics, FFT truncation, DC removed,
  peak normalised), so a saw follows 1/h within 0.2 dB up to note 84 and aliasing stays near -75 dB.
* Joystick: bilinear diamond `mix_weights(x,y)`; corners play one wave, centre all four equally.
* Unison up to 7 with detune and stereo spread, constant loudness. Filters: LP24 ladder, LP12, BP, HP with drive,
  key follow and envelope. Three envelopes (filter, amp, vector), two LFOs, glide, velocity routing. 52 params.
* Filter input is scaled by 0.125 and restored after, which keeps the ladder linear for normal levels.

## Surge XT comparison (`npm run vst:match`, pair `wt`)
* Oscillator: ours is within the Classic/Modern alias band (-78..-58 dB vs Surge -76..-41).
* Envelopes match Surge Analog mode; knob positions .2/.35/.5/.65/.8 map to 0.0066/0.029/0.113/0.42/1.6 s attack
  and 0.027/0.115/0.435/1.66/6.6 s decay and release.
* Unison: ours is constant loudness; Surge gains 1.5-2.2 dB with voice count. Deliberate.
* Not comparable: Surge filter, waveshaper and comb type changes had no effect through pedalboard, so the filters
  rest on their own tests (`wt.test.js`) only.

## Limits
* Edited waves live in localStorage (`calmbgm.wt.waves`) and in factory presets; they are not stored with user
  sounds or share links yet.
* Open ideas: wave import, wavetable morph position per wave, more filter types, Vital comparison.
