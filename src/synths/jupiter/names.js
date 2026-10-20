// The Jupiter-8 factory patch names, 11–88, as printed on Roland's factory patch sheets.
export const JP8_NAMES=[
 'Neg Sync','Neg Pluck','Juicy Funk','Sync Sweep','Cars Sync','Sync Lead','Hammer Lead','Duke Lead',
 'Clav','Harpsichord','Echo Piano','Mellow Rhodes','Honky Tonk','Xylo','Sitar','Harp',
 'Lo Strings','Mid Strings','Hi Strings','Mellow Strings','Lo Brass','Hi Brass','S/H Brass','Synth Brass',
 'Chorus Organ','Bell Organ','Combo Organ','Chiff Organ','Pipe Organ','Organ Bass Pedals','Drawbar Organ','Harmonic Percussion',
 'Train Chug','Train Horn','Jungle Beasts','Birds','Solo Voice','Choir Voices','Tomita Chime','Gong',
 'Starting Up','Poly Rhythms','Klingons','Music of the Spheres','Echo','Solar Winds','Rhythm & Sync','Handclaps',
 'Fat Fifths','Fuzzy Fifths','Up Fourth','Down Fourth','Horn Fifth','Horn Tritone','Mellow Blip','Hard Blip',
 'Clarinet','Flute','Whistle','Cello','Violin','Chime','Upright Bass','Harmonica',
];

// FNV-1a hashes of panel bytes 0–26 of each factory patch (11–88), so a decoded tape
// can be named only when a patch really is the factory one. No patch data is bundled.
export const JP8_FINGERPRINTS=["c4f0adde","df9d9f96","6a89ada1","a8105c60","b9a58da4","86cac078","f9d711f8","61c07de1","e567c10b","f47b35e8","8531e915","38eca40a","5d32b670","1a4b4247","cd06d219","fa9ce358","7f3daf39","756c7c08","cc0fdbc7","92dc4683","4885b323","b7fd4098","2de6a3d1","93f2ed19","2166d6c9","163bc31f","8f20bf2c","4d50fa01","dabbc262","9a3731eb","5fc93fe4","4f7fc783","0768eb62","ff0ce81a","9c597317","5b4fa0f0","609550c2","1c2e2a38","b7a0eb41","6114c6e8","3cc6937f","8ea1794c","b990a612","7c1605b7","8a05adca","27400f60","614433eb","a1ec18f8","276f0a04","7d4792aa","e378a912","7f229e4a","94c84315","9ea3e8fe","97e2b3ba","4f032343","ba058757","b97ce72d","f4e2701a","1c153bd4","5ea7ac3b","7ecc0fbd","9a77551d","a5e9bee4"];

export function fingerprint(data){
 let h=0x811c9dc5;
 for(let i=0;i<27;i++)h=Math.imul(h^data[i],0x01000193)>>>0;
 return h.toString(16).padStart(8,'0');
}
/** The factory name of a patch whose panel bytes match a factory patch, else ''. */
export function factoryName(data){
 const i=JP8_FINGERPRINTS.indexOf(fingerprint(data));
 return i<0?'':JP8_NAMES[i];
}
