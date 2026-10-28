# Landscape for each musical preset

Each preset (scene) maps to a landscape kind, weather, hour and season in
[src/scenery/presetScenes.js](../src/scenery/presetScenes.js). Variants
("(previous piano)", "v1", "· Bossa", "(tonal)") share their base preset's
landscape; presets not listed fall back to their category.

On a tall (portrait) window the scene is built at the window's shape with about the same
number of pixels: trees, peaks and towers keep their 16:9 size (`Scene.U`) and most of the
extra height goes to the land below the horizon (`Scene.horizonAt`).

Landscape menu options: **Preset picks the landscape**, **Time of day keeps
changing**, **Seasons keep changing**. With a "keeps changing" box off, the day
or the year stays at the preset's hour or season; with it on, it starts there
and moves on.

Some presets keep the passing day or year to a window (`hours`, `seasons` in
presetScenes.js): a night preset swings from dusk into the night and back again rather
than reaching noon, a winter one stays in the snow. Following the clock or the calendar,
the time is held to the window's nearer edge. Picking a landscape kind, a time-of-day
mode or a season mode by hand, or unticking **Preset picks the landscape**, lets go of
the window.

A preset can also pin something its landscape would otherwise leave to chance (`look`):
Ice Cave Echoes always gets the icy cavern, Lantern Circuit always the garden's strings of
paper lanterns; on the observation deck, Mildly Alarmed always faces a gas giant and
Plotting a Course drops the deck for open space; Neon Overpass lights the city skyline in pink, purple and blue (`neon`). The dice still gives a new landscape of the same kind with the same pin.

## Preset table

| Preset | Landscape | Weather | Starts at | Kept to |
|---|---|---|---|---|
| Rainy café | Café | Rain | 16:00, early autumn | 10:00–23:00 |
| City skyline | a city across dark water: three ranks of towers fading into the haze, windows that come on at dusk and flicker, red beacons on the tall ones, a far embankment with lamps and traffic, all mirrored in the water. The `neon` look lights it pink down the left edges, blue down the right and purple between, with sign panels and a coloured glow above the roofs | Odd-Time Lamplight, Bossa in Seven, Neon Overpass, Demo: 7/8 electro |
| Late-night brushes | Café | Overcast | 23:00, late autumn | 21:00–03:30 |
| Fireside folk | Campfire clearing | Clear | 21:00, late autumn | 20:00–05:00 |
| Tape memories | Window view | Haze | 18:30, late summer | 17:00–23:00 |
| Morning coffee | Café | Sparse clouds | 08:00, late spring | 06:30–11:00 |
| Quiet-room waltz | Snowy village | Snow | 17:00, early winter | 15:30–23:00, late autumn to late winter |
| Lamplight | Window view | Clear | 23:00, early autumn | 19:00–02:00 |
| Bittersweet Sunday | Farmland | Haze | 17:30, early autumn | 14:00–20:00, late summer to late autumn |
| Same Tune, Slightly Different | Train window | Streaks and puffs | 15:00, late summer | — |
| Deep night | Tundra | Clear | 01:00, early autumn | 21:00–03:30 |
| Underwater | Underwater | Clear | 21:00, early summer | — |
| Chapel organ | Castle on the hill | Streaks and puffs | 06:30, late autumn | 04:30–09:00 |
| Choir at sea | Harbour town | Overcast | 17:00, early autumn | 16:30–21:30 |
| Slow motion | Tundra | Fog | 05:00, early winter | 04:30–09:00 |
| Breathing room | Blossom garden | Haze | 05:30, early spring | 04:30–09:00, early spring to late spring |
| Wide Open Plains | Grassland | Clear | 23:00, early summer | 20:00–05:00 |
| Piano and Pads | Mountain lake | Fog | 20:00, early autumn | 19:00–05:00 |
| Ambient Piano, Distant Storm | Mountain lake | Thunderstorm | 22:00, late summer | 18:00–04:00 |
| Glass garden | Blossom garden | Sparse clouds | 11:00, early spring | 08:00–17:30, early spring to late spring |
| Clockwork | Industrial | Scattered clouds | 12:00, early autumn | — |
| Study session | Window view | Overcast | 21:00, early winter | 18:00–02:00 |
| Night drive | Synthwave | Clear | 01:30, late summer | 20:00–05:00 |
| Dorian walk | River valley | Scattered clouds | 16:00, early autumn | — |
| Sunrise in seven | Savanna | High streaks | 06:00, early summer | 04:30–09:00 |
| Sunday Reading | Café | Overcast | 14:00, early winter | 08:00–17:30 |
| Whiteboard | Window view | Sparse clouds | 14:00, early winter | 08:00–17:30 |
| Five Notes Only | Alpine peaks | Clear | 10:00, late spring | 08:00–17:30 |
| Solo Grand | Mountain lake | Clear | 14:00, early autumn | — |
| Desert dusk | Desert | Haze | 18:30, late summer | 17:00–21:00 |
| Damp Crater | Swamp | Fog | 01:00, late summer | 20:00–05:00 |
| Dark Mirror Dimension | Volcano | Clear | 22:00, late autumn | 20:00–05:00 |
| Ice Cave Echoes | Glowworm cavern | Clear | 13:00, early winter | late autumn to late winter |
| Haunted Staircase | Castle on the hill | Fog | 23:00, late autumn | 21:00–03:30, late summer to late autumn |
| Seaside Hearth | Harbour town | Overcast | 19:00, early winter | 17:00–23:00, early autumn to late winter |
| Drone and Drift | Mountain lake | Haze | 05:00, late autumn | 04:30–09:00 |
| Almost Home | Train window | Haze | 19:00, late autumn | 17:00–23:00 |
| Altman | Alien planet | Clear | 02:00, early winter | 20:00–05:00 |
| Thunderstorm | Grassland | Thunderstorm | 17:00, late summer | — |
| Beach at night | Seaside | Clear | 23:00, late summer | 20:00–05:00 |
| Campfire | Campfire clearing | Clear | 20:30, early summer | 20:00–05:00 |
| Rain on the window | Window view | Rain | 16:30, late autumn | — |
| Windy hill | Rolling hills | Streaks and puffs | 14:00, late spring | — |
| Slightly Slower Than Light | Observation deck | Clear | 02:00, early summer | — |
| Mild Vacuum | Alien planet | Clear | 03:30, early summer | — |
| Hull Breach Brunch | Observation deck | Clear | 11:00, early summer | 06:30–11:00 |
| Mildly Alarmed | Observation deck (gas giant) | Clear | 22:00, early summer | 20:00–05:00 |
| Plotting a Course | Observation deck (open space, no deck; any planet) | Clear | 15:00, late summer | — |
| Bounty Hunter Basement | Glowworm cavern | Clear | 02:00, early summer | — |
| Zero Fun Zone | Desert | Clear | 14:00, early summer | — |
| Big Blue-ish | Underwater | Clear | 12:00, early summer | 08:00–17:30 |
| Heroic Field Trip | Castle on the hill | Scattered clouds | 11:00, early spring | 08:00–17:30 |
| Slightly Lost Forest | Woodland | Fog | 07:30, late autumn | — |
| Nervous Chicken Village | Farmland | Sparse clouds | 09:30, early spring | — |
| Cold Drifts, Warm Socks | Snowy village | Snow | 11:00, early winter | late autumn to late winter |
| Soggy Home Planet | Jungle | Rain | 14:00, early summer | — |
| Ruins in the Drizzle | Castle on the hill | Rain | 15:00, early autumn | — |
| Mushroom Kingdom Commute | Grassland | Sparse clouds | 10:00, early spring | — |
| Tall Grass Route | Grassland | Scattered clouds | 13:00, late summer | — |
| Falling Blocks Folk Dance | Snowy village | Snow | 14:00, early winter | late autumn to late winter |
| Robot Factory Rush | Industrial | Dense clouds | 15:00, late summer | — |
| Boss Fight, Politely | Volcano | Clear | 17:00, early summer | — |
| Bonfire Rest | Campfire clearing | Clear | 23:30, late summer | 20:00–05:00 |
| Turnip Town | Farmland | Scattered clouds | 12:00, early autumn | — |
| Rainy Day, Chickens Inside | Farmland | Rain | 15:00, late spring | — |
| Pint-Sized Saloon | Desert | Clear | 21:00, early summer | 16:30–21:30 |
| Block Forest | Woodland | Scattered clouds | 15:30, late summer | — |
| Dig Straight Down | Glowworm cavern | Clear | 09:00, early summer | — |
| Falling Stars, Mostly Harmless | Mountain lake | Clear | 23:30, early summer | 21:00–03:30 |
| Island Shop Hours | Harbour town | Sparse clouds | 13:00, early summer | 08:00–17:30 |
| Quiet Blocky Cave | Glowworm cavern | Clear | 20:00, early summer | — |
| Open Mic Pad | Café | Clear | 20:00, early summer | 18:00–01:00 |
| Quiet Studio | Window view | Sparse clouds | 09:00, early spring | — |
| Soft Landing | Blossom garden | Sparse clouds | 15:00, early autumn | — |
| Gentle Interview | Grassland | Scattered clouds | 11:00, early autumn | — |
| Room Tone | Window view | Overcast | 12:30, late summer | — |
| Upbeat Explainer | Grassland | Scattered clouds | 16:30, late spring | — |
| Rain Under Speech | Rainy neon street | Rain | 19:30, early autumn | 18:00–02:00 |
| Late Show Lounge | Café | Clear | 22:00, late summer | 20:00–02:00 |
| Replicant Blues | Rainy neon street | Rain | 23:00, late autumn | 20:00–05:00 |
| Tears in Weather | Rainy neon street | Rain | 00:30, early winter | 20:00–05:00 |
| Oxygen Debt | Industrial | Haze | 04:00, early autumn | — |
| Oxygene Sunrise | Floating island | Haze | 06:00, early spring | 04:30–09:00 |
| Real Hero Hours | Synthwave | Scattered clouds | 20:00, late summer | 16:30–21:30 |
| Getaway Driver, Off Duty | Synthwave | Clear | 21:00, early summer | 20:00–05:00 |
| Nightcall, Voicemail | Rainy neon street | Clear | 02:30, late summer | 21:00–03:30 |
| Outrun Lullaby | Synthwave | Clear | 18:30, early summer | 16:30–21:30 |
| Piano and Clarinet, Cinematic | Castle on the hill | Overcast | 17:30, early winter | — |
| Pastel Coastline | Seaside | High streaks | 18:30, early summer | 16:30–21:30 |
| Amber Transit | Train window | Haze | 18:00, early autumn | 16:00–21:00 |
| Pocket Circuit | Synthwave | Clear | 16:00, late summer | — |
| Orbital Afterglow | Observation deck | Clear | 20:00, early summer | — |
| Long Way to Sunrise | Train window | High streaks | 05:30, late spring | 03:30–08:30 |
| Rooms Above the Clouds | Floating island | Sparse clouds | 16:30, early summer | 08:00–20:30 |
| Glass Conservatory | Jungle | Sparse clouds | 11:00, late spring | — |
| Tine and Tide | Harbour town | Scattered clouds | 10:00, late spring | — |
| Lantern Circuit | Blossom garden | Clear | 21:00, late summer | 20:00–05:00 |
| Gentle drizzle | Swamp | Rain | 07:00, early summer | 04:30–09:00 |
| Open rain | River valley | Rain | 15:00, early autumn | — |
| Rain indoors | Train window | Rain | 19:00, late autumn | 17:00–23:00 |
| Distant thunder | Savanna | Thunderstorm | 18:30, late summer | 16:30–21:30 |
| Gentle shoreline | Seaside | Clear | 06:30, early summer | 04:30–09:00 |
| Rolling surf | Harbour town | Scattered clouds | 14:00, early autumn | — |
| Coastal storm | Seaside | Thunderstorm | 21:00, early winter | 20:00–05:00 |
| Demo: Breathing cadences | Mountain lake | Haze | 08:30, early summer | — |
| Demo: Strong and soft | Rolling hills | Streaks and puffs | 10:00, early autumn | — |
| Demo: Make room | Grassland | High streaks | 07:30, early summer | — |
| Demo: Opening out | Savanna | Sparse clouds | 17:30, late summer | — |
| Demo: Two-minute wave | Seaside | Scattered clouds | 16:00, early summer | — |
| Demo: Living colour | Farmland | Sparse clouds | 08:00, early summer | — |
| Demo: Shifting metre | River valley | Scattered clouds | 13:00, late summer | — |
| Demo: Seven-eight | Woodland | Sparse clouds | 10:00, early autumn | — |

## Doesn't quite fit yet

The nearest landscape is used; these want something that is not drawn yet.

- **Seaside Hearth**: the harbour town on a winter evening, lit windows by the water. There
  is no hearth: a seaside cottage room with a fire, looking out to sea, would fit.
- **Quiet-room waltz, Fireside folk**: the snowy village and the campfire stand in for a
  warm room with a fireplace.
- **Chapel organ**: the castle at dawn. No chapel or church interior (pews, stained glass).
- **Haunted Staircase**: the castle in fog at night, in autumn. No old house or staircase.
- **Late Show Lounge, Open Mic Pad**: the café at night. No stage, bar or lounge.
- **Quiet Studio, Room Tone, Whiteboard, Study session**: the window view. No studio,
  office or study room.
- **Pint-Sized Saloon**: the desert at dusk. No saloon or western street.
- **Glass Conservatory**: the jungle. No glasshouse.
- **Zero Fun Zone, Big Blue-ish**: racing presets on the desert and underwater. No track.
- **Damp Crater**: the swamp at night. No crater.
- **Bounty Hunter Basement**: the glowworm cavern. No sci-fi base.
- **Solo Grand, Piano and Pads, Drone and Drift**: abstract presets on the mountain lake.

## The newer landscapes

Built in [wilds.js](../src/scenery/wilds.js), [places.js](../src/scenery/places.js),
[vistas.js](../src/scenery/vistas.js) and [nooks.js](../src/scenery/nooks.js); all are in the
page's Look menu. A new landscape starts in `DRAFT_BIOME_NAMES` in
[catalog.js](../src/scenery/catalog.js), which shows it only in the scenery tool
(`tools/scenery.html`, marked "new") until it moves to `BIOME_NAMES`.

| Landscape | What is in it | Presets using it |
|---|---|---|
| Alpine peaks | a tall snowy massif, a rockier range, an alpine meadow, a chalet, boulders, a green shoulder | Five Notes Only |
| Tundra | a cold climate (snow from mid autumn to late spring), stunted spruces, a lake that freezes, aurora | Deep night, Slow motion |
| Swamp | channels between mossy hummocks, cypresses on arching roots, hanging moss, snags, lily pads, fireflies, fog | Damp Crater, Gentle drizzle |
| Volcano | a cone with a glowing crater, lava flows, an ash plume lit from below, embers, a cracked lava field, a red night sky | Dark Mirror Dimension, Boss Fight, Politely |
| Synthwave | a neon horizon at every hour: a huge striped sun with a halo (sunset, magenta or rose), glowing bands and stars, a city silhouette, wireframe pyramids or cloud banks, a scrolling grid floor with a centre line or a winding glowing road | Night drive, Real Hero Hours, Getaway Driver, Off Duty, Outrun Lullaby, Pocket Circuit |
| Alien planet | a black sky by day, a ringed planet and a moon, craters, a domed outpost with a blinking mast | Mild Vacuum, Altman |
| Campfire clearing | a fire with flames, embers and a pool of light, a stone ring, a log seat, a tent, forest around | Fireside folk, Campfire, Bonfire Rest |
| Floating island | a lens of layered rock and meadow with roots hanging from its underside over a sea of cloud, a pond and stream that spill off the edge as a waterfall into the cloud, trees, sometimes an old arch with a glowing portal, crystals and rising motes that glow after dark, small hazy islets (some with threadlike falls) in the distance ([skyisles.js](../src/scenery/skyisles.js)) | Rooms Above the Clouds, Oxygene Sunrise |
| Harbour town | a bay with the town on both shores, a steep hillside town or a long waterfront; houses of one to four storeys with gable, hipped or flat roofs, gardens and cypresses, a domed church, a bell tower or a hilltop fort, a breakwater whose lighthouse sweeps the water at night, fishing boats and yachts | Choir at sea, Seaside Hearth, Island Shop Hours, Tine and Tide, Rolling surf |
| Jungle | a green-all-year climate, misty ridges of canopy with trees standing out of it, a mossy outcrop with a waterfall into a pool, creepers, ferns and broad leaves | Soggy Home Planet, Glass Conservatory |
| Castle on the hill | a castle on a hill in the middle distance: curtain wall, a keep, round towers with conical roofs or battlements, a gatehouse, flags, ivy, windows lit at night (sometimes a roofless ruin), a path winding up to it | Chapel organ, Haunted Staircase, Heroic Field Trip, Ruins in the Drizzle, Piano and Clarinet, Cinematic |
| Glowworm cavern | a grotto whose roof is spangled with glowworms, mirrored in a still underground lake, pillars of rock fading into the dark, glowing fungi on the shore, a shaft of sunlight through a hole in the roof by day; sometimes an ice cave | Ice Cave Echoes, Bounty Hunter Basement, Dig Straight Down, Quiet Blocky Cave |
| Window view | a room looking out at a landscape: wallpaper, curtains, a sill with a plant, a steaming mug and books, a lamp's glow at night, rain running down the glass | Tape memories, Lamplight, Study session, Whiteboard, Rain on the window, Quiet Studio, Room Tone |
| Underwater | light shafts and caustics from the surface, coral, kelp swaying, shoals of fish, bubbles, jellyfish glowing at night | Underwater, Big Blue-ish |
| Blossom garden | a temple garden: a pagoda and/or a hall with upturned eaves, stone lanterns lit at night, paper lanterns strung along the bank, cherries (all blossom in spring, red in autumn) and maples, a pond reaching forward under an arched red bridge mirrored into a full circle, koi, lily pads, irises, stepping stones, a far volcano; petals falling and floating in spring | Breathing room, Glass garden, Soft Landing, Lantern Circuit |
| Rainy neon street | a city street at night seen down its length: shopfronts (lit stores, roller shutters, dim bars), neon blade signs and billboards with made-up lettering, some flickering, lit windows with curtains, cables and paper lanterns across, a traffic light at the end, towers beyond; the wet road mirrors it all, rippling; people under umbrellas, steam from a grate | Rain Under Speech, Replicant Blues, Tears in Weather, Nightcall, Voicemail |
| Train window | a carriage window onto a landscape sliding past in layers (far mountains, hills with farms, fields with sheep, the embankment, telegraph poles and wires); every few minutes the train brakes into a station and waits, now and then it runs through a tunnel and the carriage lights come on; a cup steaming on the table, rain swept back along the glass | Same Tune, Slightly Different, Almost Home, Amber Transit, Long Way to Sunrise, Rain indoors |
| Observation deck | a starship's deck: one window from floor to ceiling and wall to wall onto a nebula and stars drifting at two depths, a turning planet (oceans, clouds and city lights; a banded giant with rings; ice; lava), a moon, a shuttle passing; ceiling light strips and a polished floor mirroring the view; lights follow the ship's day | Slightly Slower Than Light, Hull Breach Brunch, Mildly Alarmed, Plotting a Course, Orbital Afterglow |
| Snowy village | a cold climate; cottages (half-timbered or plaster, steep roofs) clustered up a hillside with lanes along each row and between them, windows warm at night, chimney smoke in the cold months, a church with steeple and clock, lamps with pools of light, snowy pines and mountains, a fence and a trodden path in front | Quiet-room waltz, Cold Drifts, Warm Socks, Falling Blocks Folk Dance |
| Café | inside a café looking out of its front window at a quiet street (houses, lit windows): shelves with books standing on them and the odd jar, a counter with an espresso machine and a lit cake case, a chalkboard menu, wooden tables and chairs with steaming cups, pendant lamps glowing at night, rain on the glass | Rainy café, Late-night brushes, Morning coffee, Sunday Reading, Open Mic Pad, Late Show Lounge |

## Still missing

Every gap in the earlier list now has a draft, interiors included. What is left is
variety within them.

## Sky features

Done, in [effects.js](../src/scenery/effects.js):
- **Aurora**: one or two folded curtains on clear nights over lake, hills, woodland,
  grassland and farmland: a sharp bright lower edge that meanders and kinks, vertical rays
  drifting along it, green fading through teal into violet, stars and moon showing through;
  strongest in autumn and winter, swelling and fading over a few minutes.
- **Shooting stars**: a streak every so often on dark nights, everywhere except industrial.
- **Fireflies**: after dusk over grassland, farmland, woodland, river, swamp and the campfire clearing; gone in autumn and
  winter, and in rain.
- **Embers**: sparks rising from industrial flares.
- **Milky Way**: on most clear dark nights (not in the city), a broad tilted band of glow
  with a dust lane down it and a brighter core, crowded with faint stars, fading toward the
  horizon.
- **Rainbow**: when rain clears while the sun is low, a big bow standing higher the lower
  the sun, broken where the rain was thin, with a faint secondary bow outside it; it fades
  a couple of minutes later. Rain can now clear straight to broken cloud.
- **Valley mist**: on most mornings in the open landscapes, banks of mist lying flat in the
  low ground at dawn, coloured by the sky at the horizon, drifting slowly and burning off
  as the sun climbs; the near foreground stands clear of it.
- **Falling petals**: blossoming trees (fruit trees, cherries) shed petals in spring.

Already there: falling leaves (woodland, lake banks, lone trees, strongest in autumn).

Still missing: nothing on the list. (The reef draft has its own caustics.)
