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

## Good matches
- Heroic Field Trip, Mushroom Kingdom Commute, Tall Grass Route, Soggy Home Planet, Thunderstorm, Wide Open Plains → grassland
- Slightly Lost Forest, Block Forest, Campfire, Fireside folk, Bonfire Rest, Ruins in the Drizzle → woodland
- Nervous Chicken Village, Turnip Town, Morning coffee, Rainy Day Chickens Inside, Sunday Reading → farmland
- Beach at night, Choir at sea, Island Shop Hours, Outrun Lullaby, Pastel Coastline, Tine and Tide → seaside
- Desert dusk, Pint-Sized Saloon, Dark Mirror Dimension → desert
- Cold Drifts, Ice Cave Echoes, Study session, Deep night, Falling Stars → mountain lake (snow, fog, night)
- Replicant Blues, Tears in Weather, Nightcall, Night drive, Robot Factory Rush, Clockwork → industrial
- Sunrise in seven → savanna; Windy hill, Long Way to Sunrise → hills
- Rainy café, Rain on the window, Rain Under Speech, Lamplight → river valley

## Weak matches (nearest fit used)
- **Starship set** (Slightly Slower Than Light, Mild Vacuum, Hull Breach Brunch, Mildly Alarmed, Plotting a Course): empty desert or lake at night, or industrial.
- **Caves** (Dig Straight Down, Quiet Blocky Cave, Bounty Hunter Basement, Ice Cave Echoes): surface hills, lake or industrial.
- **Racing** (Zero Fun Zone, Big Blue-ish): desert for open road.
- **Cafés, lounges, studios, saloon interiors** (Late-night brushes, Late Show Lounge, Whiteboard, Quiet Studio, Open Mic Pad, Room Tone): exteriors only.
- **Damp Crater, Boss Fight**: alien/arena places drawn as hills or desert with storm or dust.
- **Underwater**: seaside in fog.
- **Chapel organ, Haunted Staircase, Altman**: no building; hills or woodland in fog.
- **Piano and Pads, Solo Grand, other abstract presets**: neutral lake. The Demo scenes each
  have their own calm pick (lake, hills, grassland, savanna, seaside, farmland, river, woodland).

## Drafts in review

Built in [wilds.js](../src/scenery/wilds.js), [places.js](../src/scenery/places.js), [vistas.js](../src/scenery/vistas.js) and [nooks.js](../src/scenery/nooks.js) and listed in the scenery tool
(`tools/scenery.html`, marked "new"; the Shape picker shows the phone build), but not yet in
the page's Look menu or the preset table above. Once a draft is approved, move its name from
`DRAFT_BIOME_NAMES` to `BIOME_NAMES` in [catalog.js](../src/scenery/catalog.js) and point the
presets below at it.

| Draft | What is in it | Presets it would take over |
|---|---|---|
| Alpine peaks | a tall snowy massif, a rockier range, an alpine meadow, a chalet, boulders, a green shoulder | Soft Landing, Five Notes Only, Rooms Above the Clouds, Windy hill |
| Tundra | a cold climate (snow from mid autumn to late spring), stunted spruces, a lake that freezes, aurora | Cold Drifts, Warm Socks; Quiet-room waltz; Falling Blocks Folk Dance; Altman |
| Swamp | channels between mossy hummocks, cypresses on arching roots, hanging moss, snags, lily pads, fireflies, fog | Ruins in the Drizzle, Haunted Staircase, Soggy Home Planet, Damp Crater |
| Volcano | a cone with a glowing crater, lava flows, an ash plume lit from below, embers, a cracked lava field, a red night sky | Boss Fight, Politely; Dark Mirror Dimension |
| Synthwave | a neon horizon at every hour: a huge striped sun with a halo (sunset, magenta or rose), glowing bands and stars, a city silhouette, wireframe pyramids or cloud banks, a scrolling grid floor with a centre line or a winding glowing road | Outrun Lullaby; Night drive; Getaway Driver, Off Duty; Nightcall, Voicemail; Real Hero Hours; Pocket Circuit; Lantern Circuit |
| Alien planet | a black sky by day, a ringed planet and a moon, craters, a domed outpost with a blinking mast | Slightly Slower Than Light, Mild Vacuum, Plotting a Course, Orbital Afterglow, Hull Breach Brunch |
| Campfire clearing | a fire with flames, embers and a pool of light, a stone ring, a log seat, a tent, forest around | Campfire, Fireside folk, Bonfire Rest |
| Harbour town | a bay with the town on both shores, a steep hillside town or a long waterfront; houses of one to four storeys with gable, hipped or flat roofs, gardens and cypresses, a domed church, a bell tower or a hilltop fort, a breakwater whose lighthouse sweeps the water at night, fishing boats and yachts | Island Shop Hours, Seaside Hearth, Tine and Tide, Choir at sea |
| Jungle | a green-all-year climate, misty ridges of canopy with trees standing out of it, a mossy outcrop with a waterfall into a pool, creepers, ferns and broad leaves | Mushroom Kingdom Commute, Tall Grass Route, Soggy Home Planet, Glass Conservatory |
| Castle on the hill | a castle on a hill in the middle distance: curtain wall, a keep, round towers with conical roofs or battlements, a gatehouse, flags, ivy, windows lit at night (sometimes a roofless ruin), a path winding up to it | Ruins in the Drizzle, Heroic Field Trip, Chapel organ, Piano and Clarinet, Cinematic |
| Glowworm cavern | a grotto whose roof is spangled with glowworms, mirrored in a still underground lake, pillars of rock fading into the dark, glowing fungi on the shore, a shaft of sunlight through a hole in the roof by day; sometimes an ice cave | Dig Straight Down, Quiet Blocky Cave, Ice Cave Echoes, Bounty Hunter Basement |
| Window view | a room looking out at a landscape: wallpaper, curtains, a sill with a plant, a steaming mug and books, a lamp's glow at night, rain running down the glass | Rainy café, Rain on the window, Study session, Sunday Reading, Lamplight, Late-night brushes, Quiet Studio, Room Tone, Whiteboard, Morning coffee |
| Underwater | light shafts and caustics from the surface, coral, kelp swaying, shoals of fish, bubbles, jellyfish glowing at night | Underwater, Big Blue-ish, Tine and Tide |
| Blossom garden | a temple garden: a pagoda and/or a hall with upturned eaves, stone lanterns lit at night, paper lanterns strung along the bank, cherries (all blossom in spring, red in autumn) and maples, a pond reaching forward under an arched red bridge mirrored into a full circle, koi, lily pads, irises, stepping stones, a far volcano; petals falling and floating in spring | Glass garden, Breathing room, Soft Landing |
| Rainy neon street | a city street at night seen down its length: shopfronts (lit stores, roller shutters, dim bars), neon blade signs and billboards with made-up lettering, some flickering, lit windows with curtains, cables and paper lanterns across, a traffic light at the end, towers beyond; the wet road mirrors it all, rippling; people under umbrellas, steam from a grate | Replicant Blues, Tears in Weather, Nightcall, Voicemail, Late Show Lounge, Rain Under Speech |
| Train window | a carriage window onto a landscape sliding past in layers (far mountains, hills with farms, fields with sheep, the embankment, telegraph poles and wires); every few minutes the train brakes into a station and waits, now and then it runs through a tunnel and the carriage lights come on; a cup steaming on the table, rain swept back along the glass | Amber Transit, Long Way to Sunrise, Almost Home, Same Tune, Slightly Different |
| Observation deck | a starship's deck: one window from floor to ceiling and wall to wall onto a nebula and stars drifting at two depths, a turning planet (oceans, clouds and city lights; a banded giant with rings; ice; lava), a moon, a shuttle passing; ceiling light strips and a polished floor mirroring the view; lights follow the ship's day | Slightly Slower Than Light, Mild Vacuum, Plotting a Course, Orbital Afterglow, Hull Breach Brunch |
| Snowy village | a cold climate; cottages (half-timbered or plaster, steep roofs) clustered up a hillside with lanes along each row and between them, windows warm at night, chimney smoke in the cold months, a church with steeple and clock, lamps with pools of light, snowy pines and mountains, a fence and a trodden path in front | Cold Drifts, Warm Socks, Quiet-room waltz |
| Café | inside a café looking out of its front window at a quiet street (houses, lit windows): shelves with books standing on them and the odd jar, a counter with an espresso machine and a lit cake case, a chalkboard menu, wooden tables and chairs with steaming cups, pendant lamps glowing at night, rain on the glass | Rainy café, Late-night brushes, Late Show Lounge, Sunday Reading, Morning coffee, Open Mic Pad |

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
