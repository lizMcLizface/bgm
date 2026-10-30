# Voice reverb decay (voices.json), 2026-10-30

A voice with a reverb amount and no `reverbDecay` uses the engine default, **8 seconds** (engine/presetDefaults.js). The list is every voice in src/library/voices.json (142), in three groups. Derived synth presets (FM7, VS and the other synth books) are not in this file.

- Reverb on, decay not set (8 s): 116
- Reverb on, decay set: 25
- No reverb (amount 0 or missing): 1

The bass voices got a small short room (reverb3, amount 0.12, decay 1.2 s) after a listening test on Minimal Click Lab found a dry bass thin. To hear the long tails, play the first group from the top: most reverb and the default 8 s decay. The Decay knob is in the sound editor (Reverb section); a voice's `reverbDecay` in voices.json sets it for the preset.

## 1. Reverb on, decay not set (8 s default), most reverb first

| voice | category | type | amount | decay | presets using it |
|---|---|---|---|---|---|
| Nebula Lead | Leads | reverb6 | 0.6 | 8 (default) | Demo: Living colour |
| Night Glass | Pads | reverb6 | 0.6 | 8 (default) | Tears in Weather, Tears in Weather v1, Real Hero Hours (+2) |
| Wind Pad | Textures | reverb4 | 0.6 | 8 (default) | - |
| Galaxy Arp | Keys & plucks | reverb6 | 0.55 | 8 (default) | Rainfall Breaks |
| Starmap Arp | Keys & plucks | reverb6 | 0.55 | 8 (default) | Plotting a Course, Plotting a Course (previous piano) |
| Starmap Void | Pads | reverb6 | 0.55 | 8 (default) | Plotting a Course, Plotting a Course (previous piano) |
| Void Pad | Pads | reverb6 | 0.55 | 8 (default) | Mild Vacuum, Dig Straight Down |
| Breathy Choir | Pads | reverb4 | 0.5 | 8 (default) | Pastel Coastline, Pastel Coastline · 808, Pastel Coastline (previous) |
| Dark Drone | Pads | reverb4 | 0.5 | 8 (default) | Slow motion, Bonfire Rest, Seaside Hearth (+3) |
| Lament Lead | Leads | reverb6 | 0.5 | 8 (default) | Replicant Blues v1, Tears in Weather v1 |
| Measured Breathy Choir | Measured | reverb4 | 0.5 | 8 (default) | - |
| Measured Epic Strings | Measured | reverb6 | 0.5 | 8 (default) | Piano and Pads |
| Pitched Rain | Textures | reverb6 | 0.5 | 8 (default) | - |
| Shimmer | Pads | reverb6 | 0.5 | 8 (default) | Slow motion |
| Starlight Pad | Pads | reverb5 | 0.5 | 8 (default) | Falling Stars, Mostly Harmless, Ice Cave Echoes, Ice Cave Echoes v1 |
| Underwater | Textures | reverb6 | 0.5 | 8 (default) | Underwater |
| Choir Ah | Pads | reverb4 | 0.45 | 8 (default) | Choir at sea, Bounty Hunter Basement, Ice Cave Echoes (+1) |
| Glass Pad | Pads | reverb5 | 0.45 | 8 (default) | Glass garden, Sunrise in seven, Cold Drifts, Warm Socks (+9) |
| Measured Choir Ah | Measured | reverb4 | 0.45 | 8 (default) | Piano and Pads (v1) |
| Morning Haze | Pads | reverb4 | 0.45 | 8 (default) | Room Tone, Lamplight |
| Spore Haze | Pads | reverb4 | 0.45 | 8 (default) | Bounty Hunter Basement, Bounty Hunter Basement v1, Damp Crater (+8) |
| Velvet Pad | Pads | reverb4 | 0.45 | 8 (default) | Study session, Soft Landing, Drone and Drift (+2) |
| Haunted Celesta | Leads | reverb6 | 0.42 | 8 (default) | Seaside Hearth, Almost Home |
| Breathing Pad | Pads | reverb4 | 0.4 | 8 (default) | Deep night, Breathing room, Deep night · Ambient percussion |
| FM Bell | Keys & plucks | reverb6 | 0.4 | 8 (default) | Deep night, Mild Vacuum, Ice Cave Echoes (+3) |
| Ghost Sweep | Leads | reverb5 | 0.4 | 8 (default) | Oxygen Debt, Oxygene Sunrise |
| Glass Mallet | Keys & plucks | reverb6 | 0.4 | 8 (default) | Glass garden, Dig Straight Down |
| Hollow Air | Pads | reverb3 | 0.4 | 8 (default) | Rain Under Speech |
| Measured Celesta | Measured | reverb6 | 0.4 | 8 (default) | - |
| Music Box | Keys & plucks | reverb6 | 0.4 | 8 (default) | Clockwork, Falling Stars, Mostly Harmless, Cold Drifts, Warm Socks v1 (+6) |
| Neon Saw Pad | Pads | reverb5 | 0.4 | 8 (default) | Oxygene Sunrise, Nightcall, Voicemail, Outrun Lullaby (+1) |
| Signal Lead | Leads | reverb5 | 0.4 | 8 (default) | Slightly Slower Than Light, Mild Vacuum, Hull Breach Brunch (+4) |
| Slow Sweep | Pads | reverb4 | 0.4 | 8 (default) | Breathing room |
| Warm Strings | Pads | reverb4 | 0.4 | 8 (default) | Seaside Hearth, Wide Open Plains, Altman (+2) |
| Neon Blues Lead | Leads | reverb6 | 0.38 | 8 (default) | Replicant Blues, Tears in Weather |
| Soft Harp | Keys & plucks | reverb4 | 0.38 | 8 (default) | Nervous Chicken Village, Bonfire Rest |
| Bell Lead | Leads | reverb5 | 0.35 | 8 (default) | Clockwork, Demo: Make room, Demo: Groove slider (+4) |
| Bit Haze | Textures | reverb3 | 0.35 | 8 (default) | - |
| Celesta | Leads | reverb6 | 0.35 | 8 (default) | Clockwork, Falling Stars, Mostly Harmless, Cold Drifts, Warm Socks (+6) |
| Harp Pluck | Keys & plucks | reverb4 | 0.35 | 8 (default) | Fireside folk, Slightly Lost Forest, Same Tune, Slightly Different (+1) |
| Heroic Strings | Pads | reverb4 | 0.35 | 8 (default) | Mildly Alarmed, Heroic Field Trip, Heroic Field Trip v1 (+6) |
| Hollow Tremolo | Pads | reverb3 | 0.35 | 8 (default) | - |
| Ocarina | Leads | reverb4 | 0.35 | 8 (default) | Fireside folk, Sunrise in seven, Slightly Lost Forest (+2) |
| Pan Flute | Leads | reverb4 | 0.35 | 8 (default) | Big Blue-ish v1, Heroic Field Trip, Heroic Field Trip v1 (+12) |
| Soft Pad | Pads | reverb4 | 0.35 | 8 (default) | Open Mic Pad, Demo: Breathing cadences, Demo: Generated chords (+2) |
| Swelling Analog | Pads | reverb4 | 0.35 | 8 (default) | Night drive (previous), Night drive · 808 broken beat |
| Ambient Piano | Pianos | reverb4 | 0.3 | 8 (default) | - |
| Clarinet Lead | Leads | reverb3 | 0.3 | 8 (default) | Desert dusk, Quiet-room waltz, Sunday Reading (+4) |
| Coastal FM Lead | Leads | reverb4 | 0.3 | 8 (default) | Night drive, Pastel Coastline, Night drive · 808 (+2) |
| Fanfare Brass | Leads | reverb4 | 0.3 | 8 (default) | Mildly Alarmed, Heroic Field Trip, Heroic Field Trip v1 (+4) |
| Felt Keys | Keys & plucks | reverb4 | 0.3 | 8 (default) | Rainy café (previous piano), Rainy Day, Chickens Inside (previous piano), Cold Drifts, Warm Socks (previous piano) (+4) |
| Felt Keys (classic) | Classic keys | reverb4 | 0.3 | 8 (default) | - |
| Felt Keys (updated) | Keys & plucks | reverb4 | 0.3 | 8 (default) | Rainy café, Rainy Day, Chickens Inside, Cold Drifts, Warm Socks (+3) |
| Felted Piano | Pianos | reverb4 | 0.3 | 8 (default) | Felted Piano (v1) |
| FM Rhodes | Keys & plucks | reverb3 | 0.3 | 8 (default) | Late-night brushes, Late Show Lounge, Bittersweet Sunday (+7) |
| FM Rhodes (classic) | Classic keys | reverb3 | 0.3 | 8 (default) | - |
| Glass Lead | Leads | reverb4 | 0.3 | 8 (default) | Underwater, Slow motion, Damp Crater (+6) |
| Haunted Viola | Leads | reverb4 | 0.3 | 8 (default) | Altman, Altman (tonal) |
| Hollow Pulse | Leads | reverb4 | 0.3 | 8 (default) | Pocket Circuit, Orbital Afterglow, Pocket Circuit · 808 (+3) |
| Kalimba Pluck | Keys & plucks | reverb5 | 0.3 | 8 (default) | Desert dusk, Morning coffee, Morning coffee (previous piano) (+17) |
| Lo-fi Tape Pad | Pads | reverb3 | 0.3 | 8 (default) | Tape memories, Tape memories · Broken beat, Tape memories (previous) |
| Measured Chamber Strings | Measured | reverb4 | 0.3 | 8 (default) | - |
| Organ Whistle | Leads | reverb3 | 0.3 | 8 (default) | Tall Grass Route, Late-night brushes (previous) |
| Outrun Lead | Leads | reverb4 | 0.3 | 8 (default) | Nightcall, Voicemail, Outrun Lullaby, Demo: Two-minute wave (+2) |
| Reed Lead | Leads | reverb4 | 0.3 | 8 (default) | Rainy café (previous piano), Choir at sea |
| Soft Flute | Leads | reverb4 | 0.3 | 8 (default) | Late-night brushes, Dorian walk, Dorian walk (previous piano) (+9) |
| Soft Keys (updated) | Keys & plucks | reverb4 | 0.3 | 8 (default) | Morning coffee, Dorian walk, Pint-Sized Saloon (+4) |
| Soft Marimba | Keys & plucks | reverb5 | 0.3 | 8 (default) | Glass garden, Bounty Hunter Basement v1, Block Forest (+6) |
| Soft Saw Lead | Leads | reverb4 | 0.3 | 8 (default) | Study session, Zero Fun Zone, Ruins in the Drizzle (+8) |
| Starmap Piano | Keys & plucks | reverb4 | 0.3 | 8 (default) | Plotting a Course (previous piano) |
| Starmap Piano (updated) | Keys & plucks | reverb4 | 0.3 | 8 (default) | Plotting a Course, Solo Grand (v1) |
| Tine Keys | Keys & plucks | reverb3 | 0.3 | 8 (default) | Quiet-room waltz, Gentle Interview, Whiteboard (+3) |
| Tine Keys (classic) | Classic keys | reverb3 | 0.3 | 8 (default) | - |
| Tremolo Organ | Textures | reverb3 | 0.3 | 8 (default) | Chapel organ |
| Baroque Grand | Pianos | reverb4 | 0.28 | 8 (default) | - |
| Felted Piano v2 | Pianos | reverb4 | 0.28 | 8 (default) | Felted Piano |
| Nylon Guitar | Keys & plucks | reverb4 | 0.28 | 8 (default) | Turnip Town, Block Forest, Soggy Home Planet (+2) |
| Soft Drama | Pianos | reverb4 | 0.28 | 8 (default) | - |
| Arp Pluck | Keys & plucks | reverb4 | 0.25 | 8 (default) | Slightly Slower Than Light, Hull Breach Brunch, Mildly Alarmed (+11) |
| Measured String Section | Measured | reverb4 | 0.25 | 8 (default) | - |
| Parlour Meantone | Pianos | reverb4 | 0.25 | 8 (default) | - |
| Progressive Pluck | Keys & plucks | reverb4 | 0.25 | 8 (default) | Long Way to Sunrise, Rooms Above the Clouds, Progressive Night Bus |
| Soft Keys | Keys & plucks | reverb4 | 0.25 | 8 (default) | Morning coffee (previous piano), Dorian walk (previous piano), Pint-Sized Saloon (previous piano) (+7) |
| Soft Keys (classic) | Classic keys | reverb4 | 0.25 | 8 (default) | - |
| Squeezebox | Leads | reverb3 | 0.25 | 8 (default) | Turnip Town, Pint-Sized Saloon, Pint-Sized Saloon (previous piano) (+1) |
| Warm Organ | Keys & plucks | reverb3 | 0.25 | 8 (default) | Underwater, Chapel organ, Bounty Hunter Basement (+6) |
| Warm Square Lead | Leads | reverb4 | 0.25 | 8 (default) | Tape memories, Big Blue-ish, Dark Mirror Dimension (+3) |
| Ambient Piano v2 | Pianos | reverb4 | 0.22 | 8 (default) | Ambient Piano, Distant Storm, Demo: Low note, then chord |
| Concert Grand | Pianos | reverb4 | 0.22 | 8 (default) | Solo Grand (v1), Piano and Pads (v1), Piano and Clarinet, Cinematic (v1) (+1) |
| Glass Grand | Pianos | reverb4 | 0.22 | 8 (default) | - |
| Glass Grand v2 | Pianos | reverb4 | 0.22 | 8 (default) | Demo: Low note, then chord |
| House Piano | Pianos | reverb4 | 0.22 | 8 (default) | - |
| Measured Cello | Measured | reverb4 | 0.22 | 8 (default) | - |
| Measured Violin | Measured | reverb4 | 0.22 | 8 (default) | - |
| Ravel | Pianos | reverb4 | 0.22 | 8 (default) | Solo Grand |
| Soft Drama v2 | Pianos | reverb4 | 0.22 | 8 (default) | Solo Grand, Ambient Piano, Distant Storm |
| Soft Piano | Pianos | reverb4 | 0.22 | 8 (default) | - |
| Soft Piano v2 | Pianos | reverb4 | 0.22 | 8 (default) | - |
| Studio Concert | Pianos | reverb4 | 0.22 | 8 (default) | - |
| Studio Concert v2 | Pianos | reverb4 | 0.22 | 8 (default) | Slightly Lost Forest, Solo Grand, Piano and Pads (+2) |
| Subdued Piano | Pianos | reverb4 | 0.22 | 8 (default) | - |
| Subdued Piano v2 | Pianos | reverb4 | 0.22 | 8 (default) | - |
| Measured Cello Pizzicato | Measured | reverb4 | 0.2 | 8 (default) | - |
| Pixel Piano | Keys & plucks | reverb3 | 0.2 | 8 (default) | Slightly Lost Forest v1, Nervous Chicken Village v1, Mushroom Kingdom Commute (+3) |
| Racer Lead | Leads | reverb3 | 0.2 | 8 (default) | Night drive, Zero Fun Zone, Zero Fun Zone v1 (+4) |
| Chip Lead | Leads | reverb3 | 0.15 | 8 (default) | Slightly Lost Forest v1, Nervous Chicken Village v1, Mushroom Kingdom Commute (+2) |
| Old Upright | Pianos | reverb4 | 0.15 | 8 (default) | - |
| Pluck Chord | Keys & plucks | reverb4 | 0.15 | 8 (default) | Electro Story, Dub Pulse Basement, Trap House Tuesday |
| Studio Grand | Pianos | reverb4 | 0.12 | 8 (default) | Solo Grand (v1), Ambient Piano, Distant Storm (v1) |
| Tired Upright | Pianos | reverb4 | 0.1 | 8 (default) | - |
| Drive Lead | Leads | reverb4 | 0.08 | 8 (default) | Warehouse Lift, Electro Story |
| Felt Bass | Bass | - | 0.08 | 8 (default) | Tape memories, Quiet-room waltz, Rainy Day, Chickens Inside (+12) |
| Upright Pluck | Bass | reverb1 | 0.06 | 8 (default) | Fireside folk, Dorian walk, Dorian walk (previous piano) (+10) |
| Round Pluck Bass | Bass | - | 0.05 | 8 (default) | Glass garden, Morning coffee, Morning coffee (previous piano) (+11) |
| Warm Bass | Bass | reverb1 | 0.05 | 8 (default) | Desert dusk, Study session, Block Forest (+9) |
| Muted Pick Bass | Bass | reverb1 | 0.04 | 8 (default) | Big Blue-ish, Demo: Bass figures |

## 2. Reverb on, decay set, longest first

| voice | category | type | amount | decay | presets using it |
|---|---|---|---|---|---|
| CS-80 Brass | Pads | reverb6 | 0.35 | 4 s | Replicant Blues, Replicant Blues v1, Tears in Weather (+3) |
| Sine Whistle | Leads | reverb4 | 0.28 | 4 s | Choir at sea, Breathing room, Open Mic Pad (+3) |
| Measured Trumpet | Measured | reverb4 | 0.2 | 3.5 s | - |
| Measured Horn | Measured | reverb4 | 0.2 | 3.5 s | - |
| Measured Brass | Measured | reverb4 | 0.2 | 3.5 s | - |
| Measured Clarinet | Measured | reverb4 | 0.15 | 3.5 s | Piano and Clarinet, Cinematic, Piano and Clarinet, Cinematic (v1) |
| Measured Flute | Measured | reverb4 | 0.2 | 3.5 s | Rainy café, Demo: Pad and bass, Demo: Generated chords |
| Trance Chord | Pads | reverb5 | 0.3 | 2.2 s | Uplifting Trance Departures |
| Supersaw Stab | Keys & plucks | reverb5 | 0.3 | 1.6 s | Warehouse Lift |
| Techno Stab | Keys & plucks | reverb5 | 0.3 | 1.6 s | Acid Jack Afterhours, Minimal Click Lab |
| Sub Bass | Bass | reverb3 | 0.12 | 1.2 s | Deep night, Choir at sea, Clockwork (+24) |
| Analog Saw Bass | Bass | reverb3 | 0.12 | 1.2 s | Night drive, Night drive · 808, Night drive (previous) (+2) |
| Soft Square Bass | Bass | reverb3 | 0.12 | 1.2 s | - |
| Rubber Bass | Bass | reverb3 | 0.12 | 1.2 s | Sunrise in seven, Island Shop Hours, Island Shop Hours (previous piano) (+3) |
| Deep Pulse | Bass | reverb3 | 0.12 | 1.2 s | Underwater, Orbital Afterglow, Rooms Above the Clouds (+2) |
| FM Bass | Bass | reverb3 | 0.12 | 1.2 s | Late-night brushes, Late-night brushes · Jazz, Late-night brushes (previous) |
| Thump Bass | Bass | reverb3 | 0.12 | 1.2 s | Rainy café, Rainy café (previous piano) |
| Drive Bass | Bass | reverb3 | 0.12 | 1.2 s | Hull Breach Brunch, Mildly Alarmed, Zero Fun Zone (+10) |
| Chip Bass | Bass | reverb3 | 0.12 | 1.2 s | Heroic Field Trip, Heroic Field Trip v1, Slightly Lost Forest v1 (+6) |
| Deep Throb | Bass | reverb3 | 0.12 | 1.2 s | Slightly Slower Than Light, Mild Vacuum, Bounty Hunter Basement (+10) |
| Neon Pulse Bass | Bass | reverb3 | 0.12 | 1.2 s | Real Hero Hours, Getaway Driver, Off Duty, Nightcall, Voicemail (+7) |
| Seq Bass | Bass | reverb3 | 0.12 | 1.2 s | Oxygen Debt, Oxygene Sunrise, Pocket Circuit (+2) |
| Starmap Pulse | Bass | reverb3 | 0.12 | 1.2 s | Plotting a Course, Plotting a Course (previous piano) |
| Rolling Bass | Bass | reverb3 | 0.12 | 1.2 s | Warehouse Lift, Acid Jack Afterhours, Minimal Click Lab |
| Trance Bass | Bass | reverb3 | 0.12 | 1.2 s | Uplifting Trance Departures, Progressive Night Bus |

## 3. No reverb

| voice | category | presets using it |
|---|---|---|
| Acid Lead | Leads | Acid Jack Afterhours |
