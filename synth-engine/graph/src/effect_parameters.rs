// Generated from the existing append-only host effect contracts.
use super::Param;
pub const INSERTS: [Param; 29] = [
    Param{id:"bypass",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"saturation",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"drive",unit:"dB",min:0.,max:24.,default:6.,modulation:false},
    Param{id:"lowGain",unit:"dB",min:-12.,max:12.,default:0.,modulation:false},
    Param{id:"lowFreq",unit:"Hz",min:60.,max:600.,default:180.,modulation:false},
    Param{id:"midGain",unit:"dB",min:-12.,max:12.,default:0.,modulation:false},
    Param{id:"midFreq",unit:"Hz",min:200.,max:6000.,default:1000.,modulation:false},
    Param{id:"midQ",unit:"native",min:0.2,max:4.,default:0.7,modulation:false},
    Param{id:"highGain",unit:"dB",min:-12.,max:12.,default:0.,modulation:false},
    Param{id:"highFreq",unit:"Hz",min:1500.,max:12000.,default:6000.,modulation:false},
    Param{id:"phaser",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"phaserRate",unit:"Hz",min:0.02,max:5.,default:0.15,modulation:false},
    Param{id:"phaserDepth",unit:"octaves",min:0.,max:3.,default:1.5,modulation:false},
    Param{id:"phaserFreq",unit:"Hz",min:100.,max:4000.,default:700.,modulation:false},
    Param{id:"phaserFeedback",unit:"native",min:-0.75,max:0.75,default:0.2,modulation:false},
    Param{id:"flanger",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"flangerRate",unit:"Hz",min:0.02,max:5.,default:0.12,modulation:false},
    Param{id:"flangerDepth",unit:"ms",min:0.,max:4.,default:1.,modulation:false},
    Param{id:"flangerDelay",unit:"ms",min:0.3,max:20.,default:2.,modulation:false},
    Param{id:"flangerFeedback",unit:"native",min:-0.85,max:0.85,default:0.35,modulation:false},
    Param{id:"chorus",unit:"native",min:0.,max:0.8,default:0.,modulation:false},
    Param{id:"chorusRate",unit:"Hz",min:0.05,max:10.,default:0.35,modulation:false},
    Param{id:"chorusDepth",unit:"ms",min:0.,max:8.,default:3.5,modulation:false},
    Param{id:"gain",unit:"dB",min:-18.,max:6.,default:0.,modulation:false},
    Param{id:"phaserSpread",unit:"cycles",min:0.,max:0.5,default:0.25,modulation:false},
    Param{id:"flangerSpread",unit:"cycles",min:0.,max:0.5,default:0.5,modulation:false},
    Param{id:"chorusSpread",unit:"cycles",min:0.,max:0.5,default:0.5,modulation:false},
    Param{id:"chorusFeedback",unit:"native",min:-0.6,max:0.6,default:0.,modulation:false},
    Param{id:"phaserStages",unit:"native",min:2.,max:12.,default:6.,modulation:false},
];
pub const SEND: [Param; 21] = [
    Param{id:"dry",unit:"native",min:0.,max:1.,default:1.,modulation:false},
    Param{id:"reverb",unit:"native",min:0.,max:0.8,default:0.22,modulation:false},
    Param{id:"delay",unit:"native",min:0.,max:0.8,default:0.12,modulation:false},
    Param{id:"decay",unit:"s",min:0.3,max:30.,default:8.,modulation:false},
    Param{id:"size",unit:"native",min:0.2,max:1.,default:0.7,modulation:false},
    Param{id:"damping",unit:"Hz",min:500.,max:16000.,default:6000.,modulation:false},
    Param{id:"predelay",unit:"ms",min:0.,max:150.,default:25.,modulation:false},
    Param{id:"width",unit:"native",min:0.,max:1.,default:1.,modulation:false},
    Param{id:"modulation",unit:"native",min:0.,max:1.,default:0.3,modulation:false},
    Param{id:"delayMs",unit:"ms",min:40.,max:2000.,default:375.,modulation:false},
    Param{id:"feedback",unit:"native",min:0.,max:0.85,default:0.4,modulation:false},
    Param{id:"tone",unit:"Hz",min:300.,max:14000.,default:4500.,modulation:false},
    Param{id:"pingPong",unit:"native",min:0.,max:1.,default:1.,modulation:false},
    Param{id:"delayToReverb",unit:"native",min:0.,max:1.,default:0.2,modulation:false},
    Param{id:"quality",unit:"native",min:0.,max:1.,default:1.,modulation:false},
    Param{id:"bypass",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"reverbReturn",unit:"dB",min:-24.,max:18.,default:0.,modulation:false},
    Param{id:"reflections",unit:"native",min:0.,max:8.,default:0.,modulation:false},
    Param{id:"feedbackLow",unit:"Hz",min:0.,max:1000.,default:0.,modulation:false},
    Param{id:"duck",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"reverbType",unit:"native",min:0.,max:3.,default:0.,modulation:false},
];
pub const CRUSHER: [Param; 3] = [
    Param{id:"bits",unit:"native",min:2.,max:16.,default:8.,modulation:false},
    Param{id:"divide",unit:"native",min:1.,max:32.,default:1.,modulation:false},
    Param{id:"mix",unit:"native",min:0.,max:1.,default:1.,modulation:false},
];
pub const PITCH: [Param; 3] = [
    Param{id:"semitones",unit:"native",min:-24.,max:24.,default:-12.,modulation:false},
    Param{id:"cents",unit:"native",min:-50.,max:50.,default:0.,modulation:false},
    Param{id:"mix",unit:"native",min:0.,max:1.,default:0.5,modulation:false},
];
pub const ZPLANE: [Param; 6] = [
    Param{id:"a",unit:"native",min:0.,max:63.,default:0.,modulation:false},
    Param{id:"b",unit:"native",min:0.,max:63.,default:2.,modulation:false},
    Param{id:"morph",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"shift",unit:"native",min:-1.,max:1.,default:0.,modulation:false},
    Param{id:"q",unit:"native",min:0.,max:1.,default:0.5,modulation:false},
    Param{id:"mix",unit:"native",min:0.,max:1.,default:1.,modulation:false},
];
pub const SHIMMER: [Param; 5] = [
    Param{id:"mix",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"decay",unit:"native",min:0.3,max:30.,default:6.,modulation:false},
    Param{id:"semitones",unit:"native",min:0.,max:24.,default:12.,modulation:false},
    Param{id:"climb",unit:"native",min:0.,max:0.95,default:0.5,modulation:false},
    Param{id:"tone",unit:"native",min:500.,max:16000.,default:7000.,modulation:false},
];
pub const FREEZE: [Param; 4] = [
    Param{id:"mix",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"hold",unit:"boolean",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"length",unit:"native",min:0.25,max:4.,default:2.,modulation:false},
    Param{id:"fade",unit:"native",min:0.02,max:30.,default:1.,modulation:false},
];
pub const MOTION: [Param; 4] = [
    Param{id:"tremoloDepth",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"tremoloRate",unit:"native",min:0.01,max:20.,default:4.,modulation:false},
    Param{id:"autoPanDepth",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"autoPanRate",unit:"native",min:0.01,max:20.,default:0.2,modulation:false},
];
pub const TAPE: [Param; 5] = [
    Param{id:"wow",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"wowRate",unit:"native",min:0.05,max:5.,default:0.6,modulation:false},
    Param{id:"flutter",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"drive",unit:"native",min:0.,max:1.,default:0.,modulation:false},
    Param{id:"tone",unit:"native",min:500.,max:20000.,default:9000.,modulation:false},
];
