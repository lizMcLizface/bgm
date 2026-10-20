# Prophet-5 / Prophet-10 Rev 4 SysEx: status (20 Oct 2026)

**Understood.** `src/synths/prophet/sysex.js` parses program dumps and edit-buffer dumps into named panel values (tests in `sysex.test.js`). CLI: `npx vite-node tools/decodeProphetSysex.mjs <bank.syx> [--bank F5] [--raw] [--json out]`.

## Sources (not in repo)
- **Factory programs:** Sequential's free download `Prophet-5+10-Factory-Programs-ReadMe1.03.zip` (user's copy in Downloads). It holds two 31,800-byte files of 200 programs each, identical except for the bank numbers: `..._FACTORY_v1.03.syx` loads into banks 5–9 and `..._USER_v1.03.syx` into 0–4. As with the Juno, nothing is bundled: players import the file.
- **Byte map:** cross-checked against Funkybot's MIT-licensed *Prophet Rev 4 → RePro-5 converter* (funkybotseviltwin.github.io/ProphetRev4_to_RePro-5_SysEx_Converter) and its hardware measurements (Osc B fine in cents, Osc B low-frequency rates in Hz).
- **Confirmed by names:** factory bank 5 holds the 40 original Rev 3 programs.
  - SYNC I, SYNC II, SLOW SYNC and SLOW SYNC SWEEP all have sync on, a silent Osc B master and a Poly-Mod filter envelope into Osc A.
  - BASS IN FIFTHS is 14 steps (7 semitones) apart, FOURTHS W RESONANCE 10 steps, OCTAVE SAWTEETH 25 steps.
  - PULSE WIDTH MOD, the arpeggiators and the FLUTES vibrato run Osc B in low-frequency mode (0.5–6 Hz) through Poly-Mod.
  - UNISON GLIDE W RES has unison (5 voices) and glide.

## Message
- `F0 01 <dev> 02 <bank 0–9> <program 0–39> <152 packed> F7` is a program dump; `F0 01 <dev> 03 <152 packed> F7` is the edit buffer. The factory file uses `dev` = 0x32; 0x31 is also accepted (believed to be the Prophet-10).
- Banks 0–4 are user, 5–9 factory. 40 programs per bank (5 groups × 8): the code is `F5-31` for factory bank 5, group 3, program 1.
- **Packing:** 19 groups of 8 bytes. The first byte of each group holds bit 7 of the next 7 bytes (bit k = byte k), giving 133 data bytes.

## Program bytes
Knobs are 0–120 on the panel (a few factory programs store up to 127, treated as full). Switches are 0/1.

| Byte | Meaning |
| --- | --- |
| 0, 1 | Osc A / Osc B frequency: 2 steps per semitone (an odd step plays the same note as the even one below), 0–96 = C0–C4, 48 = 8'. In Osc B low-frequency mode, byte 1 is a rate (0.53 Hz at 0, 6 Hz at 72, ~93 Hz at 120, measured) |
| 2 | Osc B fine, unipolar sharp: 0 → 0, 64 → 52, 127 → 102 cents (measured) |
| 3, 4 | Osc A saw, pulse |
| 5, 6, 7 | Osc B saw, triangle, pulse |
| 8, 9 | Osc A / Osc B pulse width |
| 10, 11, 12 | Sync (Osc A slaved to B), Osc B low freq, Osc B keyboard tracking |
| 13 | Glide |
| 14, 15, 16 | Mixer: Osc A, Osc B, noise |
| 17, 18 | Cutoff, resonance |
| 19 | Filter keyboard tracking: 0 off, 1 half, 2 full |
| 20 | Filter revision: 0 = Rev 1/2, 1 = Rev 3 (every original Rev 3 program has 1) |
| 21, 22 | LFO frequency, LFO initial amount |
| 23, 24, 25 | LFO saw, triangle, square |
| 26 | Wheel-mod source mix: LFO … noise |
| 27–31 | Wheel-mod destinations: freq A, freq B, PW A, PW B, filter |
| 32, 33 | Poly-Mod amounts: filter envelope, Osc B |
| 34, 35, 36 | Poly-Mod destinations: freq A, PW A, filter |
| 37 | Vintage |
| 38, 39 | Aftertouch → filter, → amp |
| 40 | Filter envelope amount |
| 41, 42 | Velocity → filter, → amp |
| 43, 45, 47, 49 | Filter envelope A, D, S, R |
| 44, 46, 48, 50 | Amp envelope A, D, S, R |
| 51 | Release switch (off = fast release) |
| 52, 53, 54 | Unison on; voices − 1 (0–9), or 10 = chord; unison detune 0–7 |
| 55–64 | Chord memory: semitones above the key, root first, 127 = empty |
| 65–84 | Name, 20 ASCII characters |
| 86 | Pitch-bend range − 1 (0–11 semitones) |
| 87 | Key priority: low, last, low retrig, last retrig, high, high retrig |
| 97, 98 | Velocity / aftertouch amount 0–127; 255 = unset by older firmware → full depth |
| 85, 88–96, 99–132 | Unused in the factory set, or the Prophet-10 layer/stack (89–91) and category (93) fields. Not decoded |

## Open
1. **Units for the engine:** cutoff Hz, envelope seconds and LFO Hz are not yet calibrated. The converter's measurements map to RePro-5 units, not physical ones. Use the Rev 3 programs by ear, or recordings, when the engine exists.
2. **Byte 53 = 10 (chord) while unison is off:** this appears in several new factory programs (Internalized, Kyoto). Whether the chord then still applies (a firmware "poly chord") is unconfirmed.
3. **Prophet-10 layers** (bytes 88–95) are ignored. Only the Prophet-5 page is planned.
