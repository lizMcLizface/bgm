# Third-party notice: MSFA

`src/dx7.rs` is a Rust port of the DX7 emulation in **Music Synthesizer for Android (MSFA)**,
https://github.com/google/music-synthesizer-for-android, Copyright 2012 Google Inc., licensed under the
Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0).

Ported from MSFA: the envelope generator and its level table, the pitch envelope tables, the LFO, the
exponential, sine and frequency look-up construction, the 32 algorithm routing table, the operator and
feedback kernels, and the level, rate and velocity scaling tables and curves. Changed or added in this port:
fixed block rendering into Rust arrays, sample-rate scaling of the envelope speeds, amplitude modulation, controllers,
mono/portamento and voice management. This is the only third-party code in the classics crate; the rest is original.

The synth pages are private (see docs/archive/SYNTHS_PLAN.md) and are not part of the public site.
