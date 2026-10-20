# Prophet VS SysEx and waves: status (20 Oct 2026)

**Decoded.** `src/synths/vs/sysex.js` parses program dumps (bank or single) into named values and user-wave dumps into 32 single cycles. It also splits wave-set WAVs into the 128 VS waves. Tests are in `sysex.test.js`. YAML: `npx vite-node tools/exportPatchesYaml.mjs <programs.syx>` writes to the git-ignored `patches/prophet-vs/`.

## Sources (not in repo)
- **Owner's manual** CM2400B (scanned, encrypted PDF; user's Downloads). The manual gives:
  - the message envelopes and Table 14-1 (every parameter, its range and bit width), pp. 14-22 and 14-26–28
  - the modulation routing figure 10-1
  - the factory program list (p. 15-3), and filled-in sheets for programs 03, 08, 33, 40, 44, 49, 66 and 69 (ch. 15)
- **Program banks:** `VS_Factory_Patches.zip` (factory set, ZENNY 1 … TOYPLANE) and `rom-cart-patches.syx` (a cartridge set, NEWRHOAD … LOW PEG). Each comes with its user-wave dump.
- **Wave sets:** the Groove Synthesis 3rd Wave update `W3_1_6e+VSUpdate2.zip` has two WAVs of 64 cycles × 128 samples. `VS_User32+Factory32` holds waves 0–63 (user 0–31, ROM 32–63) and `VS_Factory33to96` holds waves 64–127. Wave 32 is a pure sine, as the manual says. The ROM waves (32–127) exist only there: the VS cannot dump them over MIDI.

## Program dump
`F0 01 0A <nn> <data> F7`. `nn` is a program, 0x00–0x63 (0–99), or 0x64 for all 100. Every data byte travels as two 4-bit pieces, high first, so a program is **82 bytes**.

**Packing:** the fields of Table 14-1 are bit-packed **in table order, most significant bit first**: 647 bits, with 9 spare at the end. The table gives the pressure destinations 14 bits, but the data has **15**, matching the 15 destinations in Figure 10-1. Signed fields are two's complement: mix X/Y and pans are 7 bits, amounts 8 bits.

| Fields (bits) | Notes |
| --- | --- |
| wave A–D (7), coarse A–D (5), fine A–D (7) | waves 0–31 user, 32–127 ROM; coarse 0–24 semitones up, fine 0–99 |
| cutoff, resonance, filter env amount (7) | |
| LFO 1/2 shape (3), rate (7) | triangle, square, saw down, ramp up, random |
| amp env: rates 1, 2, 3, 4, 4A; levels 0–3; loop (3), repeat (3) | the amplifier's levels 4 and 4A are fixed at 0 |
| filter env: rates 1–4A; levels 0–4; loop, repeat | |
| mix env: rates 1–4A; X 0–4, Y 0–4 (signed 7); loop, repeat | joystick X −64 = A (left) … +63 = C; Y −64 = B (top) … +63 = D |
| keyboard mode (2), split point (7), link (7), double detune (5), double delay (7), unison (3), glide (7) | modes single/split/double; split point is a MIDI note, with middle C (60) shown as C3; the delay is shown ×4; unison 0 = off, 1–7 = on with that detune |
| chorus sides (2), rate, depth, volume (7) | which bit is left is unconfirmed: every sheet has both on |
| pan voice 1–8 (signed 7) | −63 left … +63 right |
| name: 8 × 5 bits | `A`–`Z` = 0–25, `1`–`5` = 26–30, space = 31 |
| arp rate (7), mode (2), scan (3), octaves (2), repeats (2), split (2), voicing, velocity, layer, rests (1 each) | mode normal/auto latch/extend; scan up/down/up-down/assign/reverse/random; octaves and repeats stored −1 |
| LFO 1/2 amount (7); pressure, velocity, keyboard, filter-env amounts (signed 8) | |
| destinations: LFO 1 (10), LFO 2 (10), pressure (15), velocity (5), keyboard (4), filter env (2), mod wheel (3) | bit 0 = first destination in Figure 10-1's order |

**Loops:** 0 off; 1–3 forward from point 0/1/2; 4–6 back and forth between point 0/1/2 and 3. A repeat of 0 means continuous; 1–6 are counts (assumed from the sheets' "C").

**Destination order** (bit 0 first): freq A, B, C, D, filter, mix A-C, mix B-D, then per source:
- **LFO 1:** LFO 2 rate, LFO 2 amount, pan
- **LFO 2:** LFO 1 rate, LFO 1 amount, pan
- **Pressure:** LFO 1 rate, LFO 1 amount, LFO 2 rate, LFO 2 amount, volume, pan, chorus rate, chorus depth

The other sources route to fewer places:
- **Velocity:** filter env amount, mix A-C, mix B-D, amp env amount, pan
- **Keyboard:** filter, mix A-C, mix B-D, pan
- **Filter env:** all four freqs, pan
- **Mod wheel:** LFO 1 amount, LFO 2 amount, chorus depth

**How it was confirmed:**
- **Bit packing:** in table order, 15 of 10,900 field values exceed their documented range; other orders give 400+.
- **Names:** all 100 decode to the manual's list. Three differ by a letter or suffix (ELFIP/ELFIN, WORLOX/WARLOX, ZARG 1), consistent with a later revision of the bank.
- **Sheets 03, 08, 33 and 40:** waves, rates, levels, pans, amounts, routings, arpeggiator and keyboard settings match. A few values differ (Volkanik's chorus 38/50 vs 30/53, amp rate 4), again as from a revised bank.
- **Pressure field length:** across 200 programs, bits 49–57 of the switch area are never set, so the field is 15 bits.

## User-wave dump
`F0 01 0A 7F <12,288 4-bit pieces> F7`: 6,144 bytes = 32 waves × **192 bytes**.

Each wave stores the **top 8 bits of its 128 samples as signed bytes**, then 64 bytes of **low 4-bit parts** (two per byte; high nibble first is assumed). Read this way, 10 user waves in the two dumps are exact copies of ROM waves (32, 37, 40, 46, 47, 50, 101). An offset-binary reading fits only a few waves, and loosely.

## Open
1. **Joystick mix:** the formula from X/Y to the four oscillator percentages is not linear. The sheets give test points: Volkanik (0, +63) → 0/0/0/100, (0, −64) → 0/100/0/0, (+63, −64) → 0/51/49/0, (+51, +6) → 1/4/81/14 and (0, −7) → 26/30/24/20, as A/B/C/D.
2. **Units:** rates and levels to seconds and Hz, coarse/fine to cents, LFO rates. To fit by ear or from recordings when the engine exists.
3. **Small unknowns:** which chorus bit is left; the repeat encoding beyond "0 = continuous"; the order of the low nibbles.
4. **Wave numbering in the WAVs:** follows the files' own order. The manual's descriptions (sine 32, saw 33, square 34, …) agree on 32 but list saw and square the other way round.
