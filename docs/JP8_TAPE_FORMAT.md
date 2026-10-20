# Jupiter-8 tape: status (20 Oct 2026)

**Solved and hardened.** `src/synths/jupiter/tape.js` decodes a cassette WAV into 64 patches, and `patch.js` turns them into named parameters (tests in `tape.test.js`). CLI: `npx vite-node tools/decodeJp8Tape.mjs <wav> [--raw] [--json out]`. It reports damaged and missing patches.

## Sources (not in repo)
- **Genuine factory bank:** Hyperreal `Jp8data.wav` (user's copy: `C:\Users\rimuru\Downloads\jp8patch.zip`). 11025 Hz, 8-bit mono. Decodes with 0 framing errors and all 65 checksums correct. Pilot at 98.2 % speed (DFT peak; the old zero-crossing estimate said 98.4 %).
- **Sunshine Jones WAV:** a *modified* bank. About a quarter matches the genuine set; the rest is replaced or moved. Don't use it.
- **Patch sheets:** sunshine-jones.com `Roland-Jupiter-8-Factory-patch-sheets.pdf`. Used only to work out the byte map.

## Format
- **Signal:** FSK 1300/2100 Hz, 300 baud, 8N2, LSB first, idle = mark. Speed is measured from the pilot tone.
- **File:** `80 80 80 50 00 01 FF 01`, then records `40 00 LL TT <LL bytes>`, then `F0 00 00`.
  - 0x81 = patch presets (34 bytes, not decoded).
  - 0x80 = patch: `01 nn FF` + 28 bytes. The third byte is FF on the real tape (an earlier note said 00).
- **Checksum:** the last body byte makes **(TT + every body byte) mod 256 = 0**. For a patch that means (number + 28 data bytes) mod 256 = 0x80. It holds for all 64 patches and the preset record.
- **Patch bytes:**
  - **b0:** VCO-2 range, continuous: semitones from 8' = (b0−82)·36/255.
  - **b1–b4:** VCO-mod LFO, VCO-mod ENV, PWM, cross mod.
  - **b5–b6:** VCO-2 fine (centre 128), source mix.
  - **b7–b9:** cutoff, resonance, env mod. **b10–b11:** ENV-1/ENV-2 sustain.
  - **b12–b17:** LFO rate, LFO delay, HPF, VCF LFO, key follow, VCA level.
  - **b18–b20:** ENV-1 A/D/R. **b21–b23:** ENV-2 A/D/R. **b27:** checksum.
- **Switches** (bit = 1 means lever up):
  - **b24:** bits 0–1 LFO wave (0–3 = knob left→right); bit 2 mod VCO-1; bit 3 mod VCO-2; bits 4–5 PWM source (3 LFO, 2 manual, 1 ENV-1); bits 6–7 VCO-1 range.
  - **b25:** bits 2–3 VCO-1 wave; bits 4–5 VCO-2 wave; bits 6–7 VCA LFO depth; bits 0–1 always 1.
  - **b26:** bit 1 = 0 sync on; bit 2 = 0 VCO-2 low freq; bit 3 slope up; bit 4 VCF env switch up; bit 5 = 0 ENV-1 key follow; bit 6 = 0 ENV-1 inverted; bit 7 = 0 ENV-2 key follow; bit 0 always 1.
- **Confirmed by names:** all "Sync" patches have sync on, both "Neg" patches invert ENV-1, the effect patches use low-freq VCO-2, and the interval patches give the right fifths and fourths.

## Decoder pipeline (robustness)
1. **Read the WAV:** 8/16/24/32-bit PCM or 32/64-bit float, plain or WAVE_FORMAT_EXTENSIBLE. It tolerates extra chunks and streamed (oversized) data lengths, and keeps every channel.
2. **Channel candidates:** the mono mix first, then each channel. It keeps whichever gives the most intact patches, which handles out-of-phase pairs and a dead or noisy channel.
3. **Filter and resample:** 500 Hz high-pass (removes DC and hum), then windowed-sinc decimation to about 11 kHz.
4. **Pilot tone:** found relative to the recording's own loudness, so quiet transfers work. Speed comes from a DFT peak, which hiss doesn't bias.
5. **Mark/space discriminator:** normalised and bit-long, with a silence floor 30 dB under the pilot.
6. **UART framing:** samples each bit at its centre and re-locks on every start bit, so wow, flutter and drift only matter within one byte.
7. **Record search:** records are found by their headers anywhere in the stream, so a dropout costs only the patches it touches. Each one is checked against its checksum.
8. **Repeated banks:** copies of the same bank on one recording are merged, taking each patch from an intact copy.

**Stress test** (factory tape, 2026-10-20): byte-exact under all of these:
- format, sample-rate and channel changes: all WAV encodings, 8–48 kHz, out-of-phase or noise-only right channel, polarity flip
- level and noise: −50 dB, +20 dB clipped, hiss down to 6 dB SNR (63/64 patches at 3 dB, the missing one reported), loud 50 Hz hum, DC offset
- tape and timing faults: 2.5 kHz low-pass, 1 kHz high-pass, ±4 % speed, 0.8 % wow, 0.5 % flutter, 98→101 % drift, 20 s of hiss padding, junk before the pilot

Dropouts damage only the patches they hit, and those are always flagged; no wrong patch has ever come through unflagged. A 5-minute 44.1 kHz stereo file takes about 2.7 s in Node; the factory tape takes about 60 ms. The harness lives outside the repo (scratchpad); the unit tests cover the main cases synthetically.

## Open
1. Which slope (−12/−24 dB) is "up", and which envelope the VCF switch selects when up (ENV-1 assumed). Horn Tritone reads +9.6 st.
2. Slider-to-units calibration (Hz, seconds): do this when building the engine.
3. The 34-byte 0x81 record (patch presets / panel memory) is not decoded.
4. **Next:** build the Jupiter-8 engine and page, with a "load tape WAV" import like the Juno's `.syx` shelf, reusing `tape.js`. Show damaged/missing patches in the browser.
