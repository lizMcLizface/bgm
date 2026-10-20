# /synths: what to listen for

A checklist for the next session at the tablet and piano (HTTPS preview on port 5176, which serves `dist/`: run `npm run build` first). Each item says what to play, what should happen, and which knob to report if it doesn't. "Too much / too little" is useful: the units are estimates.

## Prophet-5 (`/synths/prophet5/`, built 20 Oct, never heard)

### First minute
1. **Plain preset:** hold a chord. Two slightly detuned saws, a warm half-open filter. Is it a sensible "neutral" level next to the Juno's Plain?
2. **Latency and feel:** fast repeated notes on Resonant Pluck. Any lag, clicks or dropouts? Watch the header meter's voice count and peak.
3. **Velocity:** Poly Brass soft vs hard. Hard should open the filter clearly, not just get louder.

### The presets
| Preset | Play | Listen for |
| --- | --- | --- |
| Poly Brass | chords, medium tempo | filter "blooms" on each note; not too bright at rest |
| Sync Lead | single line, bend | the sync "tearing" sweep at each note; vibrato only with the mod wheel |
| Soft Strings | slow chords | gentle movement from the LFO on pulse width; no zipper noise |
| Fifths Bass | low notes | the fifth on top sounds in tune; punchy, not boomy |
| Poly-Mod Bell | single notes across the range | metallic, bell-like, decaying; harsh/whistly at the top? |
| Resonant Pluck | fast arpeggios | a wet "pew" without a piercing whistle |
| Unison Lead | legato line, then hold two keys and release the upper | thick; glide between notes; returns to the held key |
| PWM Organ | chords | steady chorus-like wobble, organ-style on/off envelope |
| Filter Sweep Pad | hold a chord for 10 s | slow opening then closing; resonance not too squeaky |
| Electric Keys | soft vs hard playing | dynamic; a little bark when played hard |
| Noise Wind | hold one note | slowly moving windy noise; nothing tonal |

### Factory programs ("P5 programs" shelf)
The local factory file loads by itself. **F5 = the original 1978 Rev 3 programs**, the yardstick. Compare with recordings or videos of a real Prophet-5 if you have them.
- **F5-11 … F5-18 and the SYNC ones (SYNC I, SYNC II, SLOW SYNC, SLOW SYNC SWEEP):** does the sweep cover the right range and speed?
- **PULSE WIDTH MOD, FLUTES, the arpeggiator programs:** the low-frequency Osc B rate (too fast or slow?).
- **RESONANCE BELLS:** should ring like bells from the filter alone. Silent or a whistle means the resonance curve is off.
- **BASS IN FIFTHS, OCTAVE SAWTEETH:** intervals in tune.
- **UNISON GLIDE W RES:** fat unison and glide speed.
- **F4-26 House Vibez:** renders almost silent here. If it's a real, audible sound, the bottom of the cutoff knob is too low.
- General: note any program that is much too quiet or loud, too dark or bright, or has envelopes that are clearly too fast or slow. Write down the program code (e.g. F5-23) with "too dark" etc.

### Things to report as calibration numbers
- **Cutoff knob range** (now 20 Hz–20 kHz), **envelope times** (attack 1 ms–10 s, decay/release 2 ms–15 s), **LFO** (0.05–25 Hz), **glide** (up to 5 s).
- **Poly-Mod depth:** how far Osc B → Freq A goes at half the knob.
- **Wheel-mod depth:** vibrato amount with the wheel halfway.
- **Vintage:** at the default 25 %, is the detuning pleasant or seasick?
- **2× rate:** switch Off/On on Sync Lead at high notes. Is there an audible difference (harsh "aliasing" tones at Off), and any extra crackle on the tablet at On?

## Jupiter-8 (`/synths/jupiter8/`, built 20 Oct, never heard)

### Presets
| Preset | Play | Listen for |
| --- | --- | --- |
| Big Brass | chords | the classic JP-8 brass swell; velocity opens it |
| Sync Sweep | single line | VCO-2 synced and swept by ENV-1: a vocal "yow" |
| Wide Strings | slow chords | the 12 dB slope's thinner, buzzier strings |
| Cross-Mod Bell | single notes | metallic bell; shorter decay higher up (key follow) |
| Funk Clav | staccato | snappy, resonant; not too quiet |
| Unison Lead | legato line | thick, glides; vibrato fades in after a moment |
| Arp Pluck | hold a chord | arpeggio up over two octaves at a steady rate; turn Hold on and let go |
| Soft Organ | chords | gentle tremolo from VCA LFO step 1 |
| Inverted Sweep | hold a chord | filter dips then opens (ENV-1 inverted) |
| Sample & Hold | hold a note | random filter steps |
| Breath Flute | melody | breathy, delayed vibrato |

### Things to try
- **Assign modes:** Poly 1 vs Poly 2 on a long-release sound, playing one key repeatedly: Poly 2 should cycle voices (slightly different each time), Poly 1 restrikes the same voice. Solo vs Unison on Unison Lead.
- **Arpeggio:** modes Up/Down/U/D/Rand, Oct 1–4, rate. Timing should be rock steady; report any drift or doubled notes when changing chords.
- **Slope switch** on any bright patch: −24 should be smoother and darker. If the tape's string patches sound wrong (too dull or too buzzy), the slope lever reading is swapped.

### Split and dual layers
The **Layer** buttons (top left) choose whether the panel edits the upper or lower patch. **Key mode** (Whole / Dual / Split) is next to Assign.
- **Bass | Strings** (Split at G3): bass below with glide, strings above. Is the split point where you expect? Hold a bass note and play strings over it: the bass should stay mono, the strings polyphonic.
- **Brass + Strings** (Dual): both on every key. Play a six-note chord: with 4 + 4 voices the layers will start stealing notes. Is that acceptable, or should the voice limit be higher?
- **Arp | Pad** (Split at C4): hold a chord with the left hand; the arpeggio should keep running while you play the pad on top.
- **Balance** between Up and Lo; **Copy to lower** then change one setting to make a detuned dual sound; load a tape patch into each layer in turn.
- Known gap: the original shares one arpeggiator and portamento across both layers; here each layer has its own.

### Factory tape ("JP-8 tape" shelf)
The local factory tape decodes itself (takes a second). Compare with recordings or videos of a real Jupiter-8:
- **11–18** (Neg Sync … Duke Lead): sync and leads.
- **31–38** (Lo/Mid/Hi Strings, Brass): the famous pads and brass. Slope and envelope times matter most here.
- **51–58** (Train Chug, Jungle Beasts, Birds, Tomita Chime …): cross-mod and effects. These depend most on the cross-mod depth.
- **Quietest:** Harmonic Percussion (48), Birds (54), Handclaps (68), Klingons (63). Are they really that quiet or short?
- Report any patch that is clearly the wrong brightness, envelope speed or pitch.

## Pitch wheel and ribbon (all engines)
A bug found while building the later ones: the Prophet-5 and Jupiter-8 scaled the bend down (a ±2 semitone wheel gave about ±⅓ semitone). Fixed on 20 Oct: the bend is now in semitones as the Setup panel's wheel range says, for every synth. Check the wheel range on Prophet, Jupiter and Minimoog; a "program bend range" from imported Prophet programs is ignored by design.

## Prophet VS (`/synths/vs/`, built 20 Oct, never heard)
The most different instrument: four waves mixed by a position on the **Vector** pad (A left, B top, C right, D bottom), which a **mix envelope** moves around by itself. Your local factory set and the waves load automatically ("VS programs" shelf: tens × units, 0–99; the grey buttons switch between the factory and cartridge sets).
- **Start with the factory programs:** ZENNY 1 (0), STRING 1 (4), BRASS-ish and bell programs, VIBRELES (72), EMARIMBA (73), BELTONE1 (82), ORGAN 2 (80), VOLKANIK (listen for the slow evolving loops). The patch should move by itself while you hold a chord (mix envelope), not only when you touch the pad.
- **Envelope rates:** on the VS **0 is the fastest and 99 the slowest** (an instant attack is rate 0). If programs feel too sluggish or too snappy, the time curve (1.5 ms … 30 s) is the thing to report, and which programs.
- **The vector pad:** drag in the diamond: you should hear the four oscillators trade places smoothly, a vertex = one oscillator alone. It springs back unless **Hold** is on.
- **Raw waves** (Voice group, "Waves"): Clean is band-limited, Raw/Lo-fi read the original samples directly, which aliases and is rougher like the hardware: compare on high notes.
- **Modulation matrix:** pressure (touch pad on the shell), mod wheel, velocity, keyboard. Check that "velocity → amp env amount" feels right on a piano.
- **Loops:** programs with a mix or amp loop (VOLKANIK, LOOP 1, anything that pulses): is the loop speed believable and does the back-and-forth look right?
- **Without your waves** the programs play on built-in waves (they sound different, as the wave numbers mean something else): the built-in presets (Vector Pad, Glass Bell, Sweep …) use them.
- Known gaps: no split/double keyboard mode, no arpeggiator, the chorus is the shared one, R4A is ignored.

## OB-Xa (`/synths/obxa/`, built 20 Oct, never heard)
Layers work as on the Jupiter: the **Layer** buttons choose which patch the panel edits; **Key mode** is Whole / Double / Split.
| Preset | Play | Listen for |
| --- | --- | --- |
| Brass Ensemble | chords | the swell on the 24 dB filter; the classic wide OB-Xa brass |
| Sync Lead | single line | sync sweep from the filter envelope; wheel vibrato |
| Strings | slow chords | pulse-width movement; 12 dB filter's brighter, buzzier strings |
| Rock Unison | single line | eight voices on one note, detuned; glide |
| Electric Piano | soft and hard | tine and decay; velocity |
| Harp | arpeggios | plucked decay; is it too quiet? (it is the quietest preset) |
| Calliope, S/H Burble, Bass, Wind | various | pulse organ, stepped filter, a 4-voice bass, noise sweep |
| Bass \| Strings, Brass + Strings | split / double | the layers; Double shares the voices 4 + 4 |
- **Patch book shelf** (loads by itself): groups A, B, AB … D and programs 1–8; it loads into the *selected layer*, so you can build a split from two book programs. Compare with the book's tips and with recordings: A1 Brass Ensemble, A3 Low Strings, B3 High Strings, AB1 Trumpet Ensemble, AC2 Bass I, AB5 Filter Drone, D3 polyphonic portamento. Programs where the drawing is wrong (D3, ACD2) show a "drawing note".
- Report the units that matter: filter cutoff range, envelope times, the detune amount, the sync-sweep depth (Env → pitch) and whether the 12/24 dB switch sounds right.
- Known gaps: no chord/hold, no programmer memory, 8 voices maximum (4 per layer in Double/Split).

## Minimoog (`/synths/minimoog/`, built 20 Oct, never heard)
It is monophonic: chords sound only the lowest note (priority Low), as on the original.
| Preset | Play | Listen for |
| --- | --- | --- |
| Fat Bass | low notes | weight and punch; the filter contour "wow" on each note; try velocity |
| Classic Lead | legato line | the glide only between held notes; thick but not muddy |
| Brass | chords' lowest notes or a line | slow swell, release following the decay |
| Wow Bass | held low notes | oscillator 3 free-running as a filter LFO |
| Pluck Pulse | fast notes | short, resonant, percussive |
| Vibrato Lead | line, mod wheel | vibrato comes only with the wheel |
| Singing Filter | notes across the range | a pure filter whistle at the pitch played; should track the keyboard exactly |
| Zap, Wind | single notes | noise through the filter sweep |
| Organ Stack, Overdrive Growl | low notes | clean stacked squares; and a hot, fed-back, dirty bass |
- **Overdrive:** raise Drive and the mixer levels: it should thicken and distort like the real overloaded mixer. Too clean, or too harsh?
- **Trigger Single/Multi:** hold a note, play a second key: Single keeps the contours running (legato), Multi restarts them.
- **Priority:** Low / Last / High with two held keys.
- **Keyboard ⅓ / ⅔** on Singing Filter: with both on the pitch tracks exactly; with one it drifts flat/sharp up the keyboard.
- Report: contour depth (how far the filter opens), drive amount, pulse widths, glide time, noise colours.

## DX7 (`/synths/dx7/`, built 20 Oct, never heard)
The envelope, scaling, LFO and algorithm behaviour come from MSFA's measured DX7 data, so this is the one engine you can judge directly against your memory of the real DX7, and the ROM voices are the test.
- **The Cartridge shelf** (ROM1A loads by itself; other cartridges are in the grey buttons): bank buttons 1–8 / 9–16 / 17–24 / 25–32, then voice 1–8. Check E.PIANO 1 (11), BRASS 1 (1), BASS 1, MARIMBA, HARPSICH 1, TUB BELLS, PIANO 1, E.ORGAN, FLUTE 1 against any recordings or other emulators you have. Attack clicks, brightness and decay times matter most.
- Compare **velocity**: a DX7 voice should open up with harder playing (that is the per-operator key velocity sensitivity).
- **Mod wheel and aftertouch** add vibrato (Voice group: Wheel/Touch → pitch). **Mono + Porta** for lead voices.
- **Editing:** pick an operator in the diagram or the Operator buttons; the OP envelope/output/frequency/scaling groups then edit it. Voice parameters are read when a note starts, so release and replay to hear a change.
- Known gaps: algorithms 4 and 6 have no feedback sound (their multi-operator loops are not run), no DAC/12-bit grit, and the amplitude modulation depth is an estimate (the EP "tremolo" voices will show it).
- The original presets: Tine Piano, Glass Bells, Slap Bass, Marimba, Clav, Drawbar Organ, Soft Pad, Reed Lead, Init Voice: starting points only, not tuned.

## Juno-106 (`/synths/juno/`, built 19 Oct, never heard)
- The 12 presets: especially **Filter Whistle** (self-oscillation tracking the keys), **Pluck Arp** (resonance), **Chorus Organ** (chorus I+II).
- The chorus modes I, II and I+II on Classic Pad: I+II should be a fast, shallow vibrato-like shimmer.
- The "106 bank" shelf (factory bank auto-loads): Brass, Strings, the A82 Resonance Funk "ping", and the quietest percussive patches (Hand Claps, Pizzicato, Shaker) for level.
- High-pass positions on Bass 106: Boost should add weight, 2 and 3 thin it out.

## CS-80
Already played and liked. Only check that nothing changed for the worse after the shared-code updates.
