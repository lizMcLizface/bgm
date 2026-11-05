// Each DIY FM library sound's own space and rack chain, so that none is left at the synth's default room and echo.
// effects: reverb and delay sends; inserts: saturation, EQ, phaser, flanger, chorus; rack: the units the rack adds
// (tremolo, tape, shimmer, pitch, filter, compressor, width, ring, crusher, freeze, limiter), applied in rackFor().
import {cleanRack} from '../effects/params';
import {DEFAULT_CHAIN,UNITS} from '../effects/order';

const room=(reverb,decay,more={})=>({reverb,decay,delay:0,size:Math.min(1,.25+decay/12),damping:7000,predelay:12,...more});
const echo=(delay,delayMs,feedback,more={})=>({delay,delayMs,feedback,tone:4200,pingPong:1,delayToReverb:.15,...more});
const dry=(more={})=>({reverb:0,delay:0,...more});
const comp=(threshold=-20,ratio=3,makeup=2)=>({enabled:1,threshold,ratio,makeup,attack:.01,release:.15});

export const FX={
 // two operators
 'Pure FM tine':{effects:room(.16,1.6),inserts:{phaser:.22,phaserRate:.35,phaserDepth:1.2,chorus:0},rack:{tremolo:{rate:4.6,depth:.3,spread:1}}},
 'Two-op glass piano':{effects:room(.2,2.6,{damping:9000}),inserts:{highGain:1.5,chorus:0},rack:{width:{amount:1.4}}},
 'Two-op sub bass':{effects:dry(),inserts:{saturation:.3,drive:8,lowGain:2,lowFreq:90},rack:{compressor:comp(-22,4,3),filter:{type:1,cutoff:1400,q:.9}}},
 'Two-op brass':{effects:room(.14,1.4,echo(.12,95,.12,{pingPong:0})),inserts:{saturation:.12,drive:5},rack:{compressor:comp(-18,3,2)}},
 'Two-op clav':{effects:room(.06,.5),inserts:{phaser:.4,phaserRate:.7,phaserDepth:1.8,phaserFeedback:.4},rack:{compressor:comp(-16,4,2)}},
 'Two-op marimba':{effects:room(.18,1.3),rack:{width:{amount:1.5}}},
 'Sine bell':{effects:room(.3,5),rack:{shimmer:{mix:.22,decay:6,interval:1,climb:.4}}},
 'Feedback saw lead':{effects:room(.1,1.8,echo(.26,375,.42)),inserts:{saturation:.35,drive:9},rack:{compressor:comp(-18,3,2)}},
 'FM kick':{effects:dry(),inserts:{saturation:.4,drive:10,lowGain:3,lowFreq:70},rack:{compressor:comp(-14,5,2),limiter:{ceiling:-2}}},
 'Laser zap':{effects:room(.1,1.1,echo(.3,180,.52)),inserts:{flanger:.3,flangerRate:.4,flangerDepth:1.5,flangerFeedback:.5}},
 // three
 'Three-op Rhodes':{effects:room(.14,1.8),inserts:{chorus:.18,saturation:.1,drive:4},rack:{tremolo:{rate:4.2,depth:.4,spread:1},tape:{wow:.12,flutter:.08,drive:.25,tone:8000}}},
 'Three-op slap bass':{effects:dry(),inserts:{saturation:.25,drive:7},rack:{compressor:comp(-20,4,3)}},
 'Three-op strings':{effects:room(.3,4.5),inserts:{chorus:.35,chorusRate:.25},rack:{width:{amount:1.5}}},
 'Pan pipe':{effects:room(.28,3,echo(.1,420,.3,{tone:3000})),inserts:{highGain:-2}},
 'Wire pluck':{effects:room(.12,1.2,echo(.2,160,.38)),inserts:{highGain:2}},
 'Chime ladder':{effects:room(.3,4.5,{predelay:20}),inserts:{chorus:0},rack:{shimmer:{mix:.18,decay:5,interval:2,climb:.3}}},
 'Click organ':{effects:room(.12,.9),inserts:{saturation:.25,drive:8,chorus:0},rack:{tremolo:{rate:6.5,depth:.25,spread:0}}},
 'Three-op wobble':{effects:dry(),inserts:{saturation:.3,drive:10},rack:{compressor:comp(-20,5,3),filter:{type:1,cutoff:3200,q:1.4}}},
 'Siren':{effects:room(.2,2.4,echo(.22,500,.5,{tone:3000}))},
 'Blown bottle':{effects:room(.35,3.2,{damping:5000}),inserts:{highGain:-2},rack:{filter:{type:3,cutoff:1800,q:.7}}},
 // four
 'Chorused EP':{effects:room(.12,1.4),inserts:{chorus:.28,chorusRate:.45,chorusDepth:4},rack:{tremolo:{rate:5,depth:.35,spread:1}}},
 'Wurly bark':{effects:room(.08,.9),inserts:{saturation:.3,drive:9,phaser:.18,phaserRate:.3},rack:{compressor:comp(-18,4,2),tremolo:{rate:5.4,depth:.3,spread:.5}}},
 'Funk bass':{effects:dry(),inserts:{saturation:.22,drive:6,midGain:3,midFreq:900,midQ:1},rack:{compressor:comp(-22,5,4)}},
 'Four-op vibraphone':{effects:room(.2,2.2,echo(.1,330,.28)),inserts:{chorus:0},rack:{tremolo:{rate:5.4,depth:.5,spread:1},width:{amount:1.4}}},
 'Harpsichord':{effects:room(.2,1.6,{predelay:6}),inserts:{highGain:2,midGain:-1.5,midFreq:700},rack:{width:{amount:1.3}}},
 'Church bell four':{effects:room(.38,6.5,{size:.9,predelay:30}),inserts:{chorus:0},rack:{pitch:{semi:12,mix:.12}}},
 'Synth brass four':{effects:room(.16,1.6),inserts:{chorus:.2,saturation:.15,drive:6},rack:{compressor:comp(-18,3,2),width:{amount:1.3}}},
 'Glass harp':{effects:room(.35,6,{damping:10000}),rack:{shimmer:{mix:.25,decay:8,interval:1,climb:.5,tone:11000}}},
 'Four-op choir':{effects:room(.34,5),inserts:{chorus:.3},rack:{width:{amount:1.5},tape:{wow:.1,flutter:.05,drive:.12,tone:9000}}},
 'Rubber bass':{effects:dry(),inserts:{saturation:.28,drive:9,flanger:.12,flangerRate:.2},rack:{compressor:comp(-22,4,3),filter:{type:1,cutoff:2400,q:1.1}}},
 // five
 'Hammer keys':{effects:room(.2,2,{predelay:15}),inserts:{chorus:.1},rack:{compressor:comp(-24,2.5,2),width:{amount:1.25}}},
 'Tubular bell':{effects:room(.34,5.5,{size:.85,predelay:25})},
 'Bowed bass':{effects:room(.12,1.6),inserts:{lowGain:2,lowFreq:110,saturation:.12,drive:5},rack:{compressor:comp(-22,3,3),tape:{wow:.08,flutter:.05,drive:.18,tone:6500}}},
 'Wide strings':{effects:room(.32,4.8),inserts:{chorus:.4,chorusRate:.22,chorusDepth:5},rack:{width:{amount:1.7}}},
 'FM sax':{effects:room(.14,1.6,echo(.12,110,.2,{pingPong:0})),inserts:{saturation:.18,drive:6},rack:{compressor:comp(-18,3,2),filter:{type:3,cutoff:2200,q:.5}}},
 'Bright trumpet':{effects:room(.2,2.2),inserts:{saturation:.1,drive:4},rack:{compressor:comp(-16,3.5,2)}},
 'Digital pad five':{effects:room(.35,6.5),inserts:{chorus:.3},rack:{width:{amount:1.5},pitch:{semi:12,mix:.1}}},
 'Gong':{effects:room(.4,9,{size:1,predelay:40}),inserts:{lowGain:2,lowFreq:140}},
 'Soft koto':{effects:room(.2,2.4,echo(.14,250,.3)),inserts:{highGain:-1.5},rack:{width:{amount:1.3}}},
 // six
 'Grand tines':{effects:room(.18,2.2,{predelay:16}),inserts:{chorus:.1},rack:{compressor:comp(-26,2.2,2),width:{amount:1.3}}},
 'Stage EP':{effects:room(.1,1.1),inserts:{chorus:.25,saturation:.2,drive:7},rack:{tremolo:{rate:4.8,depth:.45,spread:1},compressor:comp(-20,3,2)}},
 'String ensemble six':{effects:room(.3,5),inserts:{chorus:.38},rack:{width:{amount:1.6}}},
 'Brass section':{effects:room(.2,2.6,{size:.7}),inserts:{chorus:.15,saturation:.16,drive:6},rack:{compressor:comp(-16,3.5,3),width:{amount:1.2}}},
 'Slow choir':{effects:room(.38,7),inserts:{chorus:.3},rack:{shimmer:{mix:.15,decay:7,interval:1,climb:.4,tone:9000},width:{amount:1.5}}},
 'Crystal chimes':{effects:room(.3,4,echo(.16,420,.4,{tone:7000})),inserts:{highGain:1.5},rack:{shimmer:{mix:.2,decay:5,interval:2,climb:.35,tone:12000}}},
 'Harp':{effects:room(.26,3.2),inserts:{chorus:.1},rack:{width:{amount:1.4}}},
 'Drifting pad':{effects:room(.38,8,{modulation:.5}),inserts:{chorus:.3,phaser:.12,phaserRate:.07},rack:{tape:{wow:.3,wowRate:.4,flutter:.1,drive:.2,tone:7500},width:{amount:1.5}}},
 'Double reed':{effects:room(.14,1.6),inserts:{saturation:.15,drive:6},rack:{compressor:comp(-18,3,2),filter:{type:3,cutoff:2600,q:.6}}},
 'Cathedral organ':{effects:room(.45,8,{size:1,predelay:35,damping:5000}),rack:{tremolo:{rate:5.6,depth:.18,spread:.5}}},
 'Pulse organ':{effects:room(.1,1.1),inserts:{saturation:.3,drive:10,chorus:0},rack:{tremolo:{rate:6.8,depth:.4,spread:0},ring:{freq:90,mix:.06}}},
 // seven
 'Seven-stack bell':{effects:room(.34,6,{predelay:24}),inserts:{chorus:.1},rack:{shimmer:{mix:.18,decay:6,interval:1,climb:.45}}},
 'Dream pad':{effects:room(.42,10,{modulation:.5,predelay:35}),inserts:{chorus:.35,phaser:.1,phaserRate:.06},rack:{shimmer:{mix:.3,decay:9,interval:1,climb:.5,tone:9500},width:{amount:1.6}}},
 'Vox humana':{effects:room(.3,4),inserts:{chorus:.25},rack:{tremolo:{rate:5.2,depth:.15,spread:1},width:{amount:1.4}}},
 'Glass choir':{effects:room(.4,7,{damping:9000}),inserts:{highGain:1.5,chorus:.28},rack:{shimmer:{mix:.28,decay:8,interval:2,climb:.45,tone:11000}}},
 'Synth strings seven':{effects:room(.28,4),inserts:{chorus:.42,chorusRate:.3,chorusDepth:5.5,phaser:.1},rack:{width:{amount:1.7}}},
 'Wide Rhodes':{effects:room(.16,1.8,echo(.1,300,.25)),inserts:{chorus:.35,chorusRate:.5},rack:{tremolo:{rate:4,depth:.5,spread:1},tape:{wow:.18,flutter:.1,drive:.3,tone:7500}}},
 'Dust harp':{effects:room(.3,4,echo(.18,500,.42,{tone:3500})),inserts:{chorus:.18},rack:{shimmer:{mix:.15,decay:5,interval:2,climb:.3}}},
 'Orchestra swell':{effects:room(.4,7.5,{size:.95,predelay:30}),inserts:{chorus:.28},rack:{compressor:comp(-24,2.5,2),width:{amount:1.4}}},
 // eight
 'Eight-op grand':{effects:room(.22,2.6,{predelay:18,size:.7}),inserts:{chorus:.08},rack:{compressor:comp(-26,2.2,2),width:{amount:1.3}}},
 'Full orchestra pad':{effects:room(.38,6.5,{size:.9}),inserts:{chorus:.4,chorusDepth:5},rack:{width:{amount:1.7}}},
 'Gamelan':{effects:room(.28,3.5,echo(.1,270,.3)),inserts:{chorus:.1},rack:{width:{amount:1.5}}},
 'Bell tree':{effects:room(.3,4.5,{predelay:20}),inserts:{highGain:1.5},rack:{shimmer:{mix:.2,decay:5,interval:3,climb:.4,tone:13000},pitch:{semi:12,mix:.1}}},
 'Evolving cloud':{effects:room(.45,12,{modulation:.6,size:1,predelay:50}),inserts:{chorus:.3,phaser:.14,phaserRate:.05,phaserDepth:2},rack:{shimmer:{mix:.32,decay:12,interval:1,climb:.55,tone:8500},tape:{wow:.35,wowRate:.3,flutter:.12,drive:.18,tone:7000},width:{amount:1.7}}},
 'Wide brass eight':{effects:room(.22,3,{size:.8}),inserts:{chorus:.22,saturation:.2,drive:7},rack:{compressor:comp(-16,4,3),width:{amount:1.5}}},
 'Chime choir':{effects:room(.36,6),inserts:{chorus:.3,highGain:1},rack:{shimmer:{mix:.2,decay:7,interval:1,climb:.4}}},
 'Singing metal':{effects:room(.3,4.5,echo(.18,560,.5,{tone:3500})),inserts:{chorus:.25},rack:{ring:{freq:120,mix:.12},filter:{type:3,cutoff:2400,q:1.2}}},
 'Sci-fi drone':{effects:room(.4,10,echo(.2,740,.55,{tone:2500})),inserts:{chorus:.3,phaser:.16,phaserRate:.08},rack:{ring:{freq:55,mix:.15},tape:{wow:.4,wowRate:.2,flutter:.2,drive:.3,tone:5500}}},
 // percussion and effects
 'FM tom':{effects:room(.08,.7),inserts:{saturation:.25,drive:7,lowGain:2},rack:{compressor:comp(-16,4,2)}},
 'FM snare':{effects:room(.2,1.1,{predelay:4}),inserts:{saturation:.3,drive:9},rack:{compressor:comp(-14,5,2),limiter:{ceiling:-2}}},
 'Metal hat':{effects:room(.06,.5),inserts:{highGain:2,lowGain:-6,lowFreq:400},rack:{crusher:{bits:10,divide:1,mix:.25}}},
 'Open hat':{effects:room(.1,.8),inserts:{highGain:2,lowGain:-6,lowFreq:400},rack:{crusher:{bits:10,divide:1,mix:.2}}},
 'Conga':{effects:room(.12,.9),inserts:{lowGain:1},rack:{compressor:comp(-18,3,2)}},
 'Wood block':{effects:room(.12,.6)},
 'Riser':{effects:room(.3,4,echo(.2,300,.45)),inserts:{phaser:.3,phaserRate:.15,phaserDepth:2.5},rack:{filter:{type:1,cutoff:5200,q:2},pitch:{semi:12,mix:.18}}},
 'Alien radio':{effects:room(.12,1.2,echo(.24,230,.55,{tone:2400})),inserts:{saturation:.3,drive:12},rack:{ring:{freq:210,mix:.25},crusher:{bits:8,divide:3,mix:.3}}},
 'Glass static':{effects:room(.38,6),inserts:{chorus:.3,highGain:1},rack:{shimmer:{mix:.3,decay:8,interval:1,climb:.5},tremolo:{rate:7.5,depth:.3,spread:1}}},
 'Dub wobble':{effects:dry(echo(.3,500,.6,{tone:2200,pingPong:0})),inserts:{saturation:.3,drive:9},rack:{compressor:comp(-20,5,3),filter:{type:1,cutoff:2600,q:1.8}}},
 'Sync lead':{effects:room(.14,1.8,echo(.24,375,.4)),inserts:{saturation:.3,drive:10},rack:{compressor:comp(-18,3,2)}},
 'Sparkle pad':{effects:room(.36,6.5),inserts:{chorus:.35,highGain:1.5},rack:{shimmer:{mix:.3,decay:8,interval:2,climb:.5,tone:12500},width:{amount:1.6}}},
};

/** The full rack values for a sound's rack units (everything else clean), or nothing when it adds none. */
export function rackFor(units={}){
 const entries=Object.entries(units);if(!entries.length)return undefined;
 const rack=cleanRack();let mask=DEFAULT_CHAIN;
 for(const [unit,values] of entries){
  mask|=1<<UNITS.indexOf(unit);rack[unit==='compressor'?'compressor.enabled':'switch.'+unit]=1;
  for(const [key,value] of Object.entries(values))rack[`${unit}.${key}`]=value;
 }
 rack['master.chain']=mask;return rack;
}
