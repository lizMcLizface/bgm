//! Portable M1 reference executor. Preparation allocates; render and enqueue do not.
//! No legacy ABI, mutable globals, Web Audio, shared memory or platform clock.
use std::f64::consts::TAU;
#[cfg(feature = "allocation-audit")]
mod allocation_audit;
mod compressor;
mod delay;
mod effect_nodes;
mod effect_parameters;
mod mixer_nodes;
mod classic_source;
#[cfg(target_arch="wasm32")]
mod plucked_abi;
mod rack_nodes;
mod voice_nodes;
mod tape_node;
mod pitched;
#[cfg(target_arch = "wasm32")]
mod fm_abi;
#[cfg(target_arch = "wasm32")]
mod core_abi;
pub use calmbgm_percussion::{DrumConfig, Hit, KitConfig};

pub const MAX_NODES: usize = 64;
pub const MAX_EDGES: usize = 128;
pub const MAX_EVENTS: usize = 4096;
pub const MAX_BLOCK: usize = 2048;
pub const MAX_FRAME: u64 = (1u64 << 53) - 1;

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u32)]
pub enum Kind {
    Tone = 0,
    Lfo = 1,
    Vca = 2,
    Mix = 3,
    Output = 4,
    Percussion = 5,
    Compressor = 6,
    HostInput = 7,
    Core = 8,
    Fm = 9,
    Piano = 10,
    Iowa = 11,
    Inserts = 12,
    SendEffects = 13,
    Delay = 14,
    DeskStrip = 15,
    DeskMatrix = 16,
    DeskFader = 17,
    DeskLimiter = 18,
    Classic = 19,
    Crusher = 20,
    Pitch = 21,
    ZPlane = 22,
    Shimmer = 23,
    Freeze = 24,
    Motion = 25,
    Plucked = 26,
    Tape = 27,
}
impl Kind {
    pub fn from_code(code: u32) -> Result<Self> {
        match code {
            0 => Ok(Self::Tone),
            1 => Ok(Self::Lfo),
            2 => Ok(Self::Vca),
            3 => Ok(Self::Mix),
            4 => Ok(Self::Output),
            5 => Ok(Self::Percussion),
            6 => Ok(Self::Compressor),
            7 => Ok(Self::HostInput),
            8 => Ok(Self::Core),
            9 => Ok(Self::Fm),
            10 => Ok(Self::Piano),
            11 => Ok(Self::Iowa),
            12 => Ok(Self::Inserts),
            13 => Ok(Self::SendEffects),
            14 => Ok(Self::Delay),
            15 => Ok(Self::DeskStrip),
            16 => Ok(Self::DeskMatrix),
            17 => Ok(Self::DeskFader),
            18 => Ok(Self::DeskLimiter),
            19 => Ok(Self::Classic),
            20=>Ok(Self::Crusher),21=>Ok(Self::Pitch),22=>Ok(Self::ZPlane),23=>Ok(Self::Shimmer),24=>Ok(Self::Freeze),
            25=>Ok(Self::Motion),
            27=>Ok(Self::Tape),
            26=>Ok(Self::Plucked),
            _ => Err(Error::Contract),
        }
    }
    fn name(self) -> &'static str {
        match self {
            Self::Tone => "ref.tone",
            Self::Lfo => "ref.lfo",
            Self::Vca => "ref.vca",
            Self::Mix => "ref.mix",
            Self::Output => "ref.output",
            Self::Percussion => "legacy.percussion",
            Self::Compressor => "graph.compressor",
            Self::HostInput => "host.audio",
            Self::Core => "legacy.core",
            Self::Fm => "legacy.fm",
            Self::Piano => "legacy.piano",
            Self::Iowa => "legacy.iowa",
            Self::Inserts => "legacy.inserts",
            Self::SendEffects => "legacy.effects",
            Self::Delay => "graph.delay",
            Self::DeskStrip => "desk.strip",
            Self::DeskMatrix => "desk.matrix",
            Self::DeskFader => "desk.fader",
            Self::DeskLimiter => "desk.limiter",
            Self::Classic => "legacy.classic",
            Self::Crusher=>"rack.crusher",Self::Pitch=>"rack.pitch",Self::ZPlane=>"rack.zplane",Self::Shimmer=>"voice.shimmer",Self::Freeze=>"voice.freeze",
            Self::Motion=>"voice.motion",
            Self::Tape=>"voice.tape",
            Self::Plucked=>"legacy.plucked",
        }
    }
    fn params(self) -> &'static [Param] {
        match self {
            Self::Tone => &TONE_PARAMS,
            Self::Lfo => &LFO_PARAMS,
            Self::Vca => &VCA_PARAMS,
            Self::Mix => &MIX_PARAMS,
            Self::Output => &[],
            Self::Percussion => &PERCUSSION_PARAMS,
            Self::Compressor => &COMPRESSOR_PARAMS,
            Self::HostInput | Self::Delay => &[],
            Self::Inserts => &effect_parameters::INSERTS,
            Self::SendEffects => &effect_parameters::SEND,
            Self::DeskStrip => &DESK_STRIP_PARAMS,
            Self::DeskMatrix => &DESK_MATRIX_PARAMS,
            Self::DeskFader => &DESK_FADER_PARAMS,
            Self::DeskLimiter => &DESK_LIMITER_PARAMS,
            Self::Crusher=>&effect_parameters::CRUSHER,Self::Pitch=>&effect_parameters::PITCH,Self::ZPlane=>&effect_parameters::ZPLANE,Self::Shimmer=>&effect_parameters::SHIMMER,Self::Freeze=>&effect_parameters::FREEZE,
            Self::Motion=>&effect_parameters::MOTION,
            Self::Tape=>&effect_parameters::TAPE,
            Self::Core | Self::Fm | Self::Piano | Self::Iowa | Self::Classic | Self::Plucked => &PITCH_PARAMS,
        }
    }
    fn ports(self) -> &'static [Port] {
        match self {
            Self::Tone => &TONE_PORTS,
            Self::Lfo => &LFO_PORTS,
            Self::Vca => &VCA_PORTS,
            Self::Mix => &MIX_PORTS,
            Self::Output => &OUTPUT_PORTS,
            Self::Percussion => &PERCUSSION_PORTS,
            Self::Compressor => &COMPRESSOR_PORTS,
            Self::HostInput => &TONE_PORTS,
            Self::Inserts | Self::Delay => &OUTPUT_PROCESSOR_PORTS,
            Self::DeskStrip|Self::DeskMatrix|Self::DeskFader|Self::DeskLimiter => &OUTPUT_PROCESSOR_PORTS,
            Self::Crusher|Self::Pitch|Self::ZPlane|Self::Shimmer|Self::Freeze=>&OUTPUT_PROCESSOR_PORTS,
            Self::Motion|Self::Tape=>&OUTPUT_PROCESSOR_PORTS,
            Self::SendEffects => &SEND_EFFECT_PORTS,
            Self::Core | Self::Fm | Self::Piano | Self::Iowa | Self::Classic | Self::Plucked => &TONE_PORTS,
        }
    }
}
impl Kind {fn mixer(self)->bool{matches!(self,Self::DeskStrip|Self::DeskMatrix|Self::DeskFader|Self::DeskLimiter)}}
impl Kind {fn rack(self)->bool{matches!(self,Self::Crusher|Self::Pitch|Self::ZPlane)}fn voice_fx(self)->bool{matches!(self,Self::Shimmer|Self::Freeze)}}
const fn desk_param(id:&'static str,unit:&'static str,min:f32,max:f32,default:f32)->Param{Param{id,unit,min,max,default,modulation:false}}
const DESK_STRIP_PARAMS:[Param;8]=[desk_param("trim","linear",0.,64.,1.),desk_param("highpass","Hz",0.,96000.,350.),desk_param("lowpass","Hz",0.,96000.,350.),desk_param("low","dB",-12.,12.,0.),desk_param("mid","dB",-12.,12.,0.),desk_param("high","dB",-12.,12.,0.),desk_param("pan","bipolar",-1.,1.,0.),desk_param("level","linear",0.,4.,1.)];
const DESK_MATRIX_PARAMS:[Param;2]=[desk_param("width","linear",0.,2.,1.),desk_param("pan","bipolar",-1.,1.,0.)];
const DESK_FADER_PARAMS:[Param;1]=[desk_param("level","linear",0.,4.,1.)];
const DESK_LIMITER_PARAMS:[Param;2]=[desk_param("enabled","boolean",0.,1.,1.),desk_param("ceiling","linear",0.05,1.,0.98)];
#[derive(Clone, Copy)]
struct Param {
    id: &'static str,
    unit: &'static str,
    min: f32,
    max: f32,
    default: f32,
    modulation: bool,
}
const PITCH_PARAMS: [Param;1] = [Param{id:"gain",unit:"linear",min:0.,max:2.,default:1.,modulation:true}];
const TONE_PARAMS: [Param; 2] = [
    Param {
        id: "frequency",
        unit: "Hz",
        min: 1.,
        max: 20000.,
        default: 220.,
        modulation: false,
    },
    Param {
        id: "amplitude",
        unit: "linear",
        min: 0.,
        max: 1.,
        default: 0.2,
        modulation: false,
    },
];
const LFO_PARAMS: [Param; 1] = [Param {
    id: "frequency",
    unit: "Hz",
    min: 0.01,
    max: 100.,
    default: 2.,
    modulation: false,
}];
const VCA_PARAMS: [Param; 1] = [Param {
    id: "gain",
    unit: "linear",
    min: 0.,
    max: 2.,
    default: 0.5,
    modulation: true,
}];
const MIX_PARAMS: [Param; 1] = [Param {
    id: "gain",
    unit: "linear",
    min: 0.,
    max: 1.,
    default: 0.5,
    modulation: false,
}];
const PERCUSSION_PARAMS: [Param; 4] = [
    Param {
        id: "gain",
        unit: "linear",
        min: 0.,
        max: 2.,
        default: 1.,
        modulation: true,
    },
    Param {
        id: "mute",
        unit: "boolean",
        min: 0.,
        max: 1.,
        default: 0.,
        modulation: false,
    },
    Param {
        id: "soloExcluded",
        unit: "boolean",
        min: 0.,
        max: 1.,
        default: 0.,
        modulation: false,
    },
    Param {
        id: "ghost",
        unit: "boolean",
        min: 0.,
        max: 1.,
        default: 0.,
        modulation: false,
    },
];
const COMPRESSOR_PARAMS: [Param; 10] = [
    Param {
        id: "threshold",
        unit: "dBFS",
        min: -80.,
        max: 0.,
        default: -24.,
        modulation: false,
    },
    Param {
        id: "ratio",
        unit: "ratio",
        min: 1.,
        max: 20.,
        default: 4.,
        modulation: false,
    },
    Param {
        id: "knee",
        unit: "dB",
        min: 0.,
        max: 24.,
        default: 6.,
        modulation: false,
    },
    Param {
        id: "attack",
        unit: "seconds",
        min: 0.0001,
        max: 1.,
        default: 0.005,
        modulation: false,
    },
    Param {
        id: "release",
        unit: "seconds",
        min: 0.005,
        max: 3.,
        default: 0.12,
        modulation: false,
    },
    Param {
        id: "output",
        unit: "dB",
        min: -24.,
        max: 24.,
        default: 0.,
        modulation: false,
    },
    Param {
        id: "blend",
        unit: "linear",
        min: 0.,
        max: 1.,
        default: 1.,
        modulation: false,
    },
    Param {
        id: "detectorHp",
        unit: "Hz",
        min: 0.,
        max: 1000.,
        default: 0.,
        modulation: false,
    },
    Param {
        id: "keyMode",
        unit: "enum",
        min: 0.,
        max: 2.,
        default: 2.,
        modulation: false,
    },
    Param {
        id: "bypass",
        unit: "boolean",
        min: 0.,
        max: 1.,
        default: 0.,
        modulation: false,
    },
];
#[derive(Clone, Copy)]
struct Port {
    id: &'static str,
    direction: &'static str,
    family: &'static str,
    channels: usize,
    role: &'static str,
    required: bool,
}
const AUDIO_OUT: Port = Port {
    id: "audio.out",
    direction: "out",
    family: "audio",
    channels: 2,
    role: "program",
    required: false,
};
const PROGRAM_IN: Port = Port {
    id: "program.in",
    direction: "in",
    family: "audio",
    channels: 2,
    role: "program",
    required: true,
};
const TONE_PORTS: [Port; 1] = [AUDIO_OUT];
const LFO_PORTS: [Port; 1] = [Port {
    id: "control.out",
    direction: "out",
    family: "control",
    channels: 1,
    role: "modulation",
    required: false,
}];
const VCA_PORTS: [Port; 2] = [PROGRAM_IN, AUDIO_OUT];
const MIX_PORTS: [Port; 3] = [
    Port {
        id: "a.in",
        required: false,
        ..PROGRAM_IN
    },
    Port {
        id: "b.in",
        required: false,
        ..PROGRAM_IN
    },
    AUDIO_OUT,
];
const OUTPUT_PORTS: [Port; 1] = [PROGRAM_IN];
const PERCUSSION_PORTS: [Port; 2] = [
    AUDIO_OUT,
    Port {
        id: "kick.out",
        role: "detector source",
        ..AUDIO_OUT
    },
];
const COMPRESSOR_PORTS: [Port; 3] = [
    PROGRAM_IN,
    Port {
        id: "detector.in",
        role: "detector",
        required: false,
        ..PROGRAM_IN
    },
    AUDIO_OUT,
];
const OUTPUT_PROCESSOR_PORTS:[Port;2]=[PROGRAM_IN,AUDIO_OUT];
const SEND_EFFECT_PORTS:[Port;4]=[PROGRAM_IN,Port{id:"reverb.in",role:"reverb-send",required:false,..PROGRAM_IN},Port{id:"delay.in",role:"delay-send",required:false,..PROGRAM_IN},AUDIO_OUT];

/// Generated directly from the Rust contracts, consumed by the host and fixture validator.
pub fn descriptors_json() -> String {
    let mut modules = Vec::new();
    for kind in [
        Kind::Tone,
        Kind::Lfo,
        Kind::Vca,
        Kind::Mix,
        Kind::Output,
        Kind::Percussion,
        Kind::Compressor,
        Kind::HostInput,
        Kind::Core,
        Kind::Fm,
        Kind::Piano,
        Kind::Iowa,
        Kind::Inserts, Kind::SendEffects, Kind::Delay,
        Kind::DeskStrip,Kind::DeskMatrix,Kind::DeskFader,Kind::DeskLimiter,Kind::Classic,Kind::Crusher,Kind::Pitch,Kind::ZPlane,Kind::Shimmer,Kind::Freeze,Kind::Motion,Kind::Plucked,Kind::Tape,
    ] {
        let params: Vec<_> = kind.params().iter().enumerate().map(|(code,p)| format!(r#"{{"id":"{}","code":{},"unit":"{}","min":{},"max":{},"default":{},"rate":"{}","modulation":{},"smoothingMs":{}}}"#,p.id,code,p.unit,p.min,p.max,p.default,if matches!(kind,Kind::Inserts|Kind::SendEffects)||kind.rack()||kind.voice_fx()||kind==Kind::Tape||kind.mixer()||p.unit=="boolean"||p.unit=="enum"{"event"}else{"audio"},p.modulation,if kind==Kind::Compressor && [5,6,9].contains(&code){5}else if kind.mixer()&&kind!=Kind::DeskLimiter{12}else{0})).collect();
        let ports: Vec<_> = kind.ports().iter().enumerate().map(|(code,p)| format!(r#"{{"id":"{}","code":{},"direction":"{}","family":"{}","channels":{},"unit":"{}","reference":"{}","rate":"audio","normalization":"none","fanIn":1,"role":"{}","required":{}}}"#,p.id,code,p.direction,p.family,p.channels,if p.family=="audio" {"linear PCM"} else {"bipolar"},if p.family=="audio" {"1 = digital full scale"} else {"-1..1"},p.role,p.required)).collect();
        let mut events = Vec::new();
        if !kind.params().is_empty() {
            events.push("\"parameter\"");
        }
        if kind.params().iter().any(|p| p.modulation) {
            events.push("\"modulation\"");
        }
        if kind == Kind::Tone {
            events.push("\"gate\"");
        }
        if kind == Kind::Percussion {
            events.push("\"hit\"");
        }
        if kind == Kind::Compressor {
            events.push("\"connection\"");
        }
        if matches!(kind,Kind::Core|Kind::Fm|Kind::Piano|Kind::Iowa|Kind::Plucked) {events.push("\"note\"");events.push("\"cancel\"");}
        if kind==Kind::Classic {events.push("\"classic\"");events.push("\"cancel\"");}
        let processing=if kind==Kind::Tape{r#","processing":"explicit pinned full Tape; stereo; prepared immutable drive bank","profile":"chromium-tape-e14de735-v1","parameterQuantumFrames":128,"fixedGroupDelayFrames":128,"latencyPolicy":"graph latency reports known FIR group portion only; intentional 6ms modulated wet delay is time-varying; automatic PDC rejects","configuration":"complete five targets plus 1..32 prepared drive curves","controlPolicy":"exact integer-frame graph events; standalone native prebooked seconds importer is separate","bypassPolicy":"active effect; native Instrument all-zero bypass is not inferred","resetPolicy":"latest targets retained; native cold tone and LFO/history restart""#}else if kind==Kind::Plucked{r#","processing":"distinct prepared finite Karplus-Strong voices; actual source banks","sampleRate":48000,"maxVoices":32,"maxNotes":2000,"maxPreparedBanks":128,"maxPreparedPcmBytes":67108864,"maxAutomationPoints":65536,"timingPolicy":"immutable sample onset/slot/lifetime; late onsets reject before enqueue","configuration":"plucked config v1; graph events own playback timing and ownership","nativeParity":"fixed browser bound for SRC/lowpass; active breath and unsupported controls reject at capture""#}else if kind==Kind::Motion{r#","processing":"owned original stereo tremolo/autopan graph; continuous instance-start LFO phase","parameterQuantumFrames":1,"latencyPolicy":"zero; exact integer-frame events; import native AudioParam seconds with explicit ceil(seconds*sampleRate)","precision":"f64 target ledger; native Float32AudioParam stage boundaries","resetPolicy":"latest targets retained; both phases restart","nativeParity":"fixed browser tolerance; OscillatorNode numeric differences retained in evidence""#}else if kind==Kind::Freeze{r#","execution":"worker-only","processing":"owned seeded original Freeze with synchronous capture; canonical128 input capture","adapterLatencyFrames":128,"parameterQuantumFrames":128,"random":"xorshift32-v1","resetPolicy":"retain latest targets; clear cache/history; restart captured seed","capturePolicy":"original four-second copy can exceed callback deadline; no serial realtime fallback","maxInstances":2"#}else if kind.rack()||kind.voice_fx(){r#","processing":"owned original kernel; canonical128 input capture","adapterLatencyFrames":128,"parameterQuantumFrames":128,"configuration":"complete original targets; ZPlane shape banks immutable after preparation; Pitch wet delay is intrinsic/time-varying and excluded from fixed128 adapter latency","resetPolicy":"retain latest targets; clear cache/history; restart seed where applicable""#}else if kind.mixer(){r#","processing":"owned stereo desk primitive, sample-by-sample","configuration":"complete mixer config v1 matching sampleRate; graph events own the only clock","smoothingPolicy":"original 12ms mixer smoothing; limiter immediate","latencyPolicy":"limiter ceil(sampleRate * 0.003) even when disabled; query prepared instance","precision":"f64 parameter authority","resetPolicy":"clear histories; restore latest targets using captured startup settlement""#}else if kind==Kind::Classic{r#","processing":"owned original native composite on source-local canonical128 callbacks","configuration":"classic config v1; model0..13, detached params/waves/polyphony","timingPolicy":"exact sample timestamps; future native callback cache cannot be rewritten","eventOwnership":"one owner per source until reset","maxNoteEvents":4000,"maxVoices":32,"externalRack":"host boundary after native composite""#}else if matches!(kind,Kind::Inserts|Kind::SendEffects){r#","processing":"owned native kernel, canonical 128-frame input capture","parameterQuantumFrames":128,"adapterLatencyFrames":128,"resetPolicy":"retain latest targets; clear cached output and native tails","smoothingPolicy":"original native parameter-specific smoothing; no extra graph smoothing""#}else if kind==Kind::Delay{r#","configuration":"immutable delay frames; maximum 262144","latencyPolicy":"configured frames; use graph latency query""#}else if kind==Kind::Iowa {r#","processing":"owned Held/Decay/Roll on canonical 128-frame ticks","configuration":"prepared immutable Iowa spec v1; host preparation remains separate","eventQuantumFrames":128,"maxPreparedSpecs":96,"maxNotes":2000,"maxVoices":32,"maxRollHits":12,"maxPreparedBytes":67108864,"timingPolicy":"on/off at legacy quantum; arbitrary executor blocks do not alter voice ticks""#}else if kind==Kind::Piano {r#","processing":"prepared finite mono piano voices, duplicated stereo","configuration":"piano spec v1; immutable banks and finite envelopes; graph note-on triggers","sampleRate":48000,"maxPreparedBanks":128,"maxPreparedPcmBytes":67108864,"maxNotes":2000,"maxVoices":32,"maxAutomationPoints":65536,"stealing":"rejected; native pre-onset fade pending","resampling":"linear; approximate native AudioBufferSource parity""#}else if matches!(kind,Kind::Core|Kind::Fm){",\"processing\":\"prepared blocks\",\"configuration\":\"owned pitched spec v1; notes in graph events\",\"maxNoteEvents\":4000,\"maxAutomationPoints\":65536,\"latencyPolicy\":\"query prepared instance; FM reconstruction depends on quality\""}else if kind==Kind::Percussion{r#", "kitConfiguration":{"version":1,"voices":["felt","crisp","tr808","hand"],"slots":14,"immutableAfterPrepare":true,"absent":"raw hits; event model/tone/decay","initialLevels":"unity; legacy 20 ms target smoothing","reset":"retain kit; restore initial unity levels","fields":{"level":{"min":0,"max":2},"tone":{"min":-1,"max":1},"decay":{"min":0.5,"max":2}}}"#}else{""};
        let descriptor=format!(r#"{{"type":"{}","code":{},"version":1,"hostInput":{},"latencyFrames":{},"tailFrames":{},"tailPolicy":"{}","bypass":"{}","reset":"phase and voices cleared; compressor gain reset","ports":[{}],"parameters":[{}],"events":[{}]{}}}"#,kind.name(),kind as u32,kind==Kind::HostInput,if matches!(kind,Kind::Fm|Kind::Delay|Kind::DeskLimiter|Kind::Tape){"null"}else if matches!(kind,Kind::Inserts|Kind::SendEffects)||kind.rack()||kind.voice_fx(){"128"}else{"0"},if matches!(kind,Kind::Percussion|Kind::Core|Kind::Fm|Kind::Piano|Kind::Iowa|Kind::Inserts|Kind::SendEffects|Kind::Delay|Kind::Classic|Kind::Crusher|Kind::Pitch|Kind::ZPlane|Kind::Shimmer|Kind::Freeze|Kind::DeskStrip|Kind::DeskLimiter|Kind::Plucked|Kind::Tape){-1}else{0},if matches!(kind,Kind::Inserts|Kind::SendEffects){"native kernel parameter-dependent decay; no silent truncation"}else if kind.rack()||kind.voice_fx()||kind==Kind::Tape{"original native parameter-dependent tails"}else if kind==Kind::Classic{"native model and external rack dependent"}else if kind==Kind::Delay{"configured buffered frames"}else if kind==Kind::Percussion{"event dependent, at most 8.1 seconds; -1 denotes variable frames"}else if kind==Kind::Iowa{"prepared release, decay lifetime and roll dependent"}else if kind==Kind::Piano{"configured finite envelopes and lowpass state"}else if matches!(kind,Kind::Core|Kind::Fm){"patch and held-note dependent"}else{"none"},if kind==Kind::Compressor{"5 ms unity crossfade"}else{"unsupported"},ports.join(","),params.join(","),events.join(","),processing);
        if kind==Kind::Percussion {
            // v1 stays raw. v2 requires the kit so older runtimes fail closed.
            modules.push(descriptor.replace(processing,""));
            modules.push(descriptor.replacen("\"version\":1","\"version\":2",1));
        } else if kind==Kind::Piano { modules.push(descriptor.clone());modules.push(descriptor.replacen("\"version\":1","\"version\":2",1).replace("piano spec v1;", "piano spec v2; four frozen shared controls;"));modules.push(descriptor.replacen("\"version\":1","\"version\":3",1).replace("piano spec v1;", "piano spec v3; shared controls and prepared slot lifetimes;").replace("rejected; native pre-onset fade pending", "prepared 10 ms fade; same-slot onsets closer than 10 ms rejected")); } else { modules.push(descriptor); }
    }
    format!(
        r#"{{"api":1,"patchVersion":1,"maxNodes":{},"maxEdges":{},"maxEvents":{},"maxBlock":{},"latencyCompensation":{{"default":false,"policy":"fixed integer path differences only","fractional":"reported exactly; unequal fractional differences rejected","timeVarying":"prepared FM quality target changes rejected when enabled","maxDelayFrames":262144,"maxTotalDelayFrames":1048576}},"modules":[{}]}}"#,
        MAX_NODES,
        MAX_EDGES,
        MAX_EVENTS,
        MAX_BLOCK,
        modules.join(",")
    )
}

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u32)]
pub enum Error {
    State = 1,
    Bounds = 2,
    Contract = 3,
    Duplicate = 4,
    Missing = 5,
    Cycle = 6,
    QueueFull = 7,
    Frame = 8,
    Latency = 9,
}
fn valid_note(k:u32,id:u32,a:f32,b:f32)->bool {
 if k>6||!a.is_finite()||!b.is_finite(){return false;}
 match k {0=>id>0&&(0. ..=127.).contains(&a)&&(0. ..=1.).contains(&b),1=>id>0,2|3=>(0. ..=1.).contains(&a),4=>true,5=>id>0&&(0. ..=127.).contains(&a)&&(0. ..=8.).contains(&b),6=>id<=2&&(0. ..=3.).contains(&a)&&(0. ..=1.).contains(&b),_=>false}
}
type Result<T> = std::result::Result<T, Error>;

struct Node {
    id: u32,
    version: u32,
    kind: Kind,
    base: [f32; 32],
    phase: f64,
    gate_owner: Option<u32>,
    buffer: Vec<[f32; 2]>,
    kick: Vec<[f32; 2]>,
    percussion: Option<Box<calmbgm_percussion::Engine>>,
    percussion_kit: Option<KitConfig>,
    compressor: Option<Box<compressor::Compressor>>,
    pitched: Option<Box<pitched::Pitched>>,
    piano: Option<Box<calmbgm_piano::voice::Engine>>,
    iowa: Option<Box<calmbgm_iowa::Engine>>,
    effect: Option<Box<effect_nodes::Adapter>>,
    effect_settled: Option<bool>,
    delay: Option<delay::Delay>,
    host_latency:f64,
    mixer:Option<Box<mixer_nodes::Adapter>>,
    classic:Option<Box<classic_source::Source>>,
    rack:Option<Box<rack_nodes::Adapter>>,
    voice_fx:Option<Box<voice_nodes::Adapter>>,
    fx_mask:u32,
    motion:Option<Box<calmbgm_motion_fx::Engine>>,
    tape:Option<Box<tape_node::Adapter>>,
    plucked:Option<Box<calmbgm_plucked_voice::voice::Engine>>,
}
/// Audio links always connect matching stereo buses. Mod links explicitly map bipolar control.
#[derive(Clone, Copy, Debug)]
pub enum Link {
    Audio {
        input: usize,
    },
    Mod {
        param: usize,
        depth: f32,
        offset: f32,
        unipolar: bool,
    },
}
#[derive(Clone, Copy)]
struct Edge {
    id: u32,
    from: usize,
    to: usize,
    link: Link,
    enabled: bool,
    bus: usize,
}
#[derive(Clone, Copy, Debug)]
pub enum Action {
    Param { param: usize, value: f32 },
    MixerParam {param:usize,value:f64},
    Classic {kind:u32,id:u32,a:f32,b:f32},
    FxParam{param:usize,value:f64},
    Gate(bool),
    ModEnabled { edge: u32, enabled: bool },
    ConnectionEnabled { edge: u32, enabled: bool },
    Hit(Hit),
    Note { kind:u32, id:u32, a:f32, b:f32 },
    Cancel,
}
#[derive(Clone, Copy, Debug)]
pub struct Event {
    pub frame: u64,
    pub target: u32,
    pub owner: u32,
    pub action: Action,
}
#[derive(Clone, Copy, Default, Debug)]
pub struct Stats {
    pub late: u64,
    pub overflow: u64,
    pub applied: u64,
}
/// Dependencies include audio and modulation. The order/levels are a seam for M3,
/// not a worker scheduler. No independent branch may publish a partial output block.
#[derive(Clone, Debug)]
pub struct ScheduleEntry {
    pub id: u32,
    pub level: usize,
    pub dependencies: Vec<u32>,
}

pub struct Graph {
    sample_rate: f64,
    max_block: usize,
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    compensate_latency: bool,
    edge_delays: Vec<delay::Delay>,
    path_latencies: Vec<f64>,
    order: Vec<usize>,
    schedule: Vec<ScheduleEntry>,
    events: Vec<Event>,
    output: usize,
    prepared: bool,
    pub frame: u64,
    pub stats: Stats,
    pub paused: bool,
    left: Vec<f32>,
    right: Vec<f32>,
}
impl Graph {
    pub fn voice_fx_config(&mut self,id:u32,seed:u32)->Result<()>{self.editable()?;let i=self.index(id)?;let n=&mut self.nodes[i];if !n.kind.voice_fx()||n.voice_fx.is_some()||seed==0{return Err(Error::Contract);}n.voice_fx=Some(voice_nodes::Adapter::new(calmbgm_voice_fx::Kind::from_code(n.kind as u32-22).unwrap(),self.sample_rate,seed).ok_or(Error::Bounds)?);Ok(())}
    fn valid_fx_param(&self,i:usize,index:usize,value:f64)->bool{let n=&self.nodes[i];let bounds=if let Some(t)=&n.tape{return t.valid_param(index,value);}else if n.motion.is_some(){calmbgm_motion_fx::PARAMETER_RANGES.get(index).copied()}else if let Some(r)=&n.rack{r.kind().bounds(index)}else if let Some(v)=&n.voice_fx{v.kind().bounds(index)}else{None};value.is_finite()&&bounds.is_some_and(|(a,b)|value>=a&&value<=b)&&!(n.kind==Kind::Freeze&&index==1&&value!=0.&&value!=1.)}
    pub fn fx_initial(&mut self,id:u32,index:usize,value:f64)->Result<()>{self.editable()?;let i=self.index(id)?;if index>=32||!self.valid_fx_param(i,index,value)||self.nodes[i].fx_mask&(1<<index)!=0{return Err(Error::Contract);}let n=&mut self.nodes[i];let ok=if let Some(t)=&mut n.tape{t.initial(index,value)}else if let Some(m)=&mut n.motion{m.param(index,value)}else if let Some(r)=&mut n.rack{r.initial(index,value)}else{n.voice_fx.as_mut().unwrap().initial(index,value)};if !ok{return Err(Error::Contract);}n.fx_mask|=1<<index;n.base[index]=value as f32;Ok(())}
    pub fn rack_edit(&mut self,id:u32)->Result<&mut rack_nodes::Adapter>{self.editable()?;let i=self.index(id)?;self.nodes[i].rack.as_deref_mut().ok_or(Error::Contract)}
    pub fn fx_value(&self,id:u32,index:usize)->Result<f64>{let i=self.index(id)?;if index>=self.nodes[i].kind.params().len(){return Err(Error::Contract);}let n=&self.nodes[i];if let Some(t)=&n.tape{Ok(t.parameters()[index])}else if let Some(m)=&n.motion{Ok(m.parameters()[index])}else if let Some(r)=&n.rack{Ok(r.parameters()[index])}else{Ok(n.voice_fx.as_ref().ok_or(Error::Contract)?.parameters()[index])}}
    pub fn classic_config(&mut self,id:u32,model:u32,polyphony:usize)->Result<()>{self.editable()?;let i=self.index(id)?;if self.nodes[i].kind!=Kind::Classic||self.nodes[i].classic.is_some(){return Err(Error::Contract);}let mut p=classic_source::Source::new(self.sample_rate,model).ok_or(Error::Bounds)?;if !p.initial_polyphony(polyphony){return Err(Error::Bounds);}self.nodes[i].classic=Some(p);Ok(())}
    pub fn classic_edit(&mut self,id:u32)->Result<&mut classic_source::Source>{self.editable()?;let i=self.index(id)?;self.nodes[i].classic.as_deref_mut().ok_or(Error::Contract)}
    pub fn mixer_config(&mut self,id:u32,param:usize,value:f64,settled:bool)->Result<()>{self.editable()?;let i=self.index(id)?;if !self.nodes[i].mixer.as_mut().ok_or(Error::Contract)?.initial(param,value,settled){return Err(Error::Contract);}self.nodes[i].base[param]=value as f32;Ok(())}
    pub fn mixer_value(&self,id:u32,param:usize)->Result<f64>{let i=self.index(id)?;let n=self.nodes[i].mixer.as_ref().ok_or(Error::Contract)?.value(param);if !n.is_finite(){return Err(Error::Contract);}Ok(n)}
    pub fn mixer_reduction(&self,id:u32)->Result<f64>{let i=self.index(id)?;Ok(self.nodes[i].mixer.as_ref().ok_or(Error::Contract)?.reduction())}
    pub fn latency_compensation(&mut self, enabled:bool)->Result<()> {self.editable()?;self.compensate_latency=enabled;Ok(())}
    pub fn fx_config(&mut self,id:u32,settled:bool)->Result<()> {
        self.editable()?;let i=self.index(id)?;let kind=self.nodes[i].kind;
        if !matches!(kind,Kind::Inserts|Kind::SendEffects)||settled!=(kind==Kind::Inserts) {return Err(Error::Contract);}
        self.nodes[i].effect_settled=Some(settled);Ok(())
    }
    pub fn delay_config(&mut self,id:u32,frames:usize)->Result<()> {self.editable()?;let i=self.index(id)?;if self.nodes[i].kind!=Kind::Delay{return Err(Error::Contract);}let other=self.nodes.iter().enumerate().filter(|(n,_)|*n!=i).map(|(_,n)|n.delay.as_ref().map_or(0,|d|d.frames())).sum::<usize>();if frames>delay::MAX_FRAMES||other+frames>delay::MAX_TOTAL_FRAMES{return Err(Error::Bounds);}self.nodes[i].delay=Some(delay::Delay::new(frames).ok_or(Error::Bounds)?);Ok(())}
    pub fn input_latency(&mut self,id:u32,frames:f64)->Result<()> {self.editable()?;let i=self.index(id)?;if self.nodes[i].kind!=Kind::HostInput||!frames.is_finite()||frames<0.||frames>delay::MAX_FRAMES as f64{return Err(Error::Bounds);}self.nodes[i].host_latency=frames;Ok(())}
    pub fn tape_drive(&mut self,id:u32,value:f64)->Result<()> {self.editable()?;let i=self.index(id)?;if !self.nodes[i].tape.as_mut().ok_or(Error::Contract)?.drive(value){return Err(Error::Contract);}Ok(())}
    fn intrinsic_latency(&self,i:usize)->f64 {let n=&self.nodes[i];if n.kind==Kind::HostInput{n.host_latency}else if let Some(m)=&n.mixer{m.latency()as f64}else if n.effect.is_some()||n.rack.is_some()||n.voice_fx.is_some()||n.tape.is_some(){128.}else if let Some(d)=&n.delay{d.frames()as f64}else if let Some(p)=&n.pitched{p.stat(6).max(0.)}else{0.}}
    fn prepare_latency(&mut self)->Result<()> {
        if self.compensate_latency&&self.nodes.iter().any(|n|n.tape.is_some()||n.pitched.as_ref().is_some_and(|p|p.latency_changes())){return Err(Error::Latency);}
        self.path_latencies=vec![0.;self.nodes.len()];let mut lengths=vec![0;self.edges.len()];let mut total=self.nodes.iter().map(|n|n.delay.as_ref().map_or(0,|d|d.frames())).sum::<usize>();
        for &i in &self.order {let incoming=self.edges.iter().filter(|e|e.to==i).map(|e|self.path_latencies[e.from]).fold(0f64,f64::max);
            if self.compensate_latency {for (edge,e) in self.edges.iter().enumerate().filter(|(_,e)|e.to==i){let frames=incoming-self.path_latencies[e.from];if frames.fract()!=0.{return Err(Error::Latency);}if frames>delay::MAX_FRAMES as f64{return Err(Error::Bounds);}total=total.checked_add(frames as usize).ok_or(Error::Bounds)?;lengths[edge]=frames as usize;}}
            self.path_latencies[i]=incoming+self.intrinsic_latency(i);
        }
        if total>delay::MAX_TOTAL_FRAMES{return Err(Error::Bounds);}self.edge_delays=lengths.into_iter().map(|n|delay::Delay::new(n).unwrap()).collect();Ok(())
    }
    pub fn latency(&self,id:u32)->Result<f64>{if !self.prepared{return Err(Error::State);}Ok(self.path_latencies[self.index(id)?])}
    pub fn edge_latency(&self,id:u32)->Result<usize>{if !self.prepared{return Err(Error::State);}let i=self.edges.iter().position(|e|e.id==id).ok_or(Error::Missing)?;Ok(self.edge_delays[i].frames())}
    pub fn effect_stat(&self,id:u32,index:u32)->Result<f64>{let i=self.index(id)?;let n=&self.nodes[i];if let Some(t)=&n.tape{Ok(t.stat(index))}else if let Some(m)=&n.motion{Ok(match index{16|17=>0.,18=>m.stat(1),19=>self.prepared as u32 as f64,_=>m.stat(index)})}else if let Some(e)=&n.effect{Ok(e.stat(index))}else if let Some(e)=&n.rack{Ok(e.stat(index))}else{Ok(n.voice_fx.as_ref().ok_or(Error::Contract)?.stat(index))}}
    pub fn new(sample_rate: f64, max_block: usize) -> Result<Self> {
        if !sample_rate.is_finite()
            || !(8000. ..=192000.).contains(&sample_rate)
            || !(1..=MAX_BLOCK).contains(&max_block)
        {
            return Err(Error::Bounds);
        }
        Ok(Self {
            sample_rate,
            max_block,
            nodes: Vec::with_capacity(MAX_NODES),
            edges: Vec::with_capacity(MAX_EDGES),
            compensate_latency:false, edge_delays:Vec::new(), path_latencies:Vec::new(),
            order: Vec::with_capacity(MAX_NODES),
            schedule: Vec::new(),
            events: Vec::with_capacity(MAX_EVENTS),
            output: 0,
            prepared: false,
            frame: 0,
            stats: Stats::default(),
            paused: false,
            left: vec![0.; max_block],
            right: vec![0.; max_block],
        })
    }
    fn editable(&self) -> Result<()> {
        if self.prepared {
            Err(Error::State)
        } else {
            Ok(())
        }
    }
    fn index(&self, id: u32) -> Result<usize> {
        self.nodes
            .iter()
            .position(|n| n.id == id)
            .ok_or(Error::Missing)
    }
    pub fn add_node(&mut self, id: u32, kind: Kind, version: u32) -> Result<()> {
        self.editable()?;
        if matches!(kind,Kind::Piano|Kind::Plucked) && self.sample_rate!=48000. {return Err(Error::Contract);}
        if !(version == 1 || matches!(kind,Kind::Percussion|Kind::Piano) && version == 2 || kind==Kind::Piano && version==3) || id == 0 {
            return Err(Error::Contract);
        }
        if self.nodes.len() == MAX_NODES {
            return Err(Error::Bounds);
        }
        if self.index(id).is_ok() {
            return Err(Error::Duplicate);
        }
        if kind == Kind::Percussion
            && self
                .nodes
                .iter()
                .filter(|n| n.kind == Kind::Percussion)
                .count()
                >= 8
        {
            return Err(Error::Bounds);
        }
        let mut base = [0.; 32];
        for (i, p) in kind.params().iter().enumerate() {
            base[i] = p.default;
        }
        if matches!(kind,Kind::Core|Kind::Fm|Kind::Piano|Kind::Iowa|Kind::Classic|Kind::Plucked)&&self.nodes.iter().filter(|n|matches!(n.kind,Kind::Core|Kind::Fm|Kind::Piano|Kind::Iowa|Kind::Classic|Kind::Plucked)).count()>=8{return Err(Error::Bounds);}
        if matches!(kind,Kind::Inserts|Kind::SendEffects)&&self.nodes.iter().filter(|n|n.kind==kind).count()>=if kind==Kind::Inserts{8}else{4}{return Err(Error::Bounds);}
        if kind.rack()&&self.nodes.iter().filter(|n|n.kind.rack()).count()>=16||(kind.voice_fx()||matches!(kind,Kind::Motion|Kind::Tape))&&self.nodes.iter().filter(|n|n.kind.voice_fx()||matches!(n.kind,Kind::Motion|Kind::Tape)).count()>=8||kind==Kind::Freeze&&self.nodes.iter().filter(|n|n.kind==Kind::Freeze).count()>=2{return Err(Error::Bounds);}
        self.nodes.push(Node {
            plucked:if kind==Kind::Plucked{Some(Box::new(calmbgm_plucked_voice::voice::Engine::new(self.sample_rate,true)))}else{None},
            tape:if kind==Kind::Tape{Some(tape_node::Adapter::new(self.sample_rate).ok_or(Error::Bounds)?)}else{None},
            motion:if kind==Kind::Motion{Some(calmbgm_motion_fx::Engine::new(self.sample_rate).ok_or(Error::Bounds)?)}else{None},
            rack:if kind.rack(){Some(rack_nodes::Adapter::new(calmbgm_rack_fx::Kind::from_code(kind as u32-19).unwrap(),self.sample_rate).ok_or(Error::Bounds)?)}else{None},voice_fx:None,fx_mask:0,
            classic:None,
            mixer:if kind.mixer(){Some(mixer_nodes::Adapter::new(kind as u32-15,self.sample_rate).ok_or(Error::Bounds)?)}else{None},
            effect:if matches!(kind,Kind::Inserts|Kind::SendEffects){Some(effect_nodes::Adapter::new(kind==Kind::SendEffects,self.sample_rate as f32).ok_or(Error::Bounds)?)}else{None},
            effect_settled:None,delay:if kind==Kind::Delay{Some(delay::Delay::new(0).unwrap())}else{None},host_latency:0.,
            iowa: if kind==Kind::Iowa {Some(Box::new(calmbgm_iowa::Engine::new(self.sample_rate)))}else{None},
            piano: if kind==Kind::Piano {Some(Box::new(calmbgm_piano::voice::Engine::new(self.sample_rate,version==3)))}else{None},
            pitched: if matches!(kind,Kind::Core|Kind::Fm){Some(Box::new(pitched::Pitched::new(kind==Kind::Fm,self.sample_rate as f32)))}else{None},
            id,
            version,
            kind,
            base,
            phase: 0.,
            gate_owner: None,
            buffer: vec![[0.; 2]; self.max_block],
            kick: if kind == Kind::Percussion {
                vec![[0.; 2]; self.max_block]
            } else {
                Vec::new()
            },
            percussion: if kind == Kind::Percussion {
                Some(Box::new(calmbgm_percussion::Engine::new(
                    self.sample_rate as f32,
                )))
            } else {
                None
            },
            percussion_kit: None,
            compressor: if kind == Kind::Compressor {
                Some(Box::new(compressor::Compressor::new(
                    self.sample_rate as f32,
                )))
            } else {
                None
            },
        });
        Ok(())
    }
    /// Immutable source configuration, never a timed/live kit edit.
    pub fn percussion_config(&mut self, id: u32, version: u32, kit: KitConfig) -> Result<()> {
        self.editable()?;
        let i = self.index(id)?;
        if version != 1 || self.nodes[i].kind != Kind::Percussion || self.nodes[i].version != 2 { return Err(Error::Contract); }
        if !kit.valid() { return Err(Error::Bounds); }
        self.nodes[i].percussion.as_mut().unwrap().configure_kit(kit);
        self.nodes[i].percussion_kit = Some(kit);
        Ok(())
    }
    pub fn percussion_drum(&mut self, id: u32, drum: usize, value: DrumConfig) -> Result<()> {
        self.editable()?;
        let i = self.index(id)?;
        if self.nodes[i].kind != Kind::Percussion { return Err(Error::Contract); }
        let mut kit = self.nodes[i].percussion_kit.ok_or(Error::State)?;
        *kit.drums.get_mut(drum).ok_or(Error::Bounds)? = value;
        self.percussion_config(id, 1, kit)
    }
    fn valid_param(&self, index: usize, param: usize, value: f32) -> Result<()> {
        let p = self.nodes[index]
            .kind
            .params()
            .get(param)
            .ok_or(Error::Contract)?;
        if !value.is_finite()
            || value < p.min
            || value > p.max
            || ((p.unit == "boolean" || p.unit == "enum") && value.fract() != 0.)
            || (p.unit == "Hz" && !matches!(self.nodes[index].kind,Kind::Inserts|Kind::SendEffects) && value as f64 >= self.sample_rate / 2.)
        {
            return Err(Error::Bounds);
        }
        Ok(())
    }
    pub fn set_base(&mut self, id: u32, param: usize, value: f32) -> Result<()> {
        self.editable()?;
        let i = self.index(id)?;
        if self.nodes[i].kind.mixer()||self.nodes[i].kind.rack()||self.nodes[i].kind.voice_fx()||matches!(self.nodes[i].kind,Kind::Motion|Kind::Tape){return Err(Error::Contract);}
        self.valid_param(i, param, value)?;
        self.nodes[i].base[param] = value;
        if let Some(effect)=&mut self.nodes[i].effect {if !effect.param(param,value){return Err(Error::Contract);}self.nodes[i].fx_mask|=1<<param;}
        Ok(())
    }
    pub fn connect(&mut self, id: u32, from: u32, to: u32, link: Link) -> Result<()> {
        self.editable()?;
        if id == 0 || self.edges.iter().any(|e| e.id == id) {
            return Err(Error::Duplicate);
        }
        if self.edges.len() == MAX_EDGES {
            return Err(Error::Bounds);
        }
        let from = self.index(from)?;
        let to = self.index(to)?;
        match link {
            Link::Audio { input } => {
                if matches!(self.nodes[from].kind, Kind::Lfo | Kind::Output) {
                    return Err(Error::Contract);
                }
                let port = self.nodes[to]
                    .kind
                    .ports()
                    .get(input)
                    .ok_or(Error::Contract)?;
                if port.direction != "in" || port.family != "audio" {
                    return Err(Error::Contract);
                }
                if self
                    .edges
                    .iter()
                    .any(|e| e.to == to && matches!(e.link,Link::Audio { input: n } if n==input))
                {
                    return Err(Error::Duplicate);
                }
            }
            Link::Mod {
                param,
                depth,
                offset,
                ..
            } => {
                if self.nodes[from].kind != Kind::Lfo
                    || !self.nodes[to]
                        .kind
                        .params()
                        .get(param)
                        .is_some_and(|p| p.modulation)
                {
                    return Err(Error::Contract);
                }
                if !depth.is_finite()
                    || !offset.is_finite()
                    || depth.abs() > 4.
                    || offset.abs() > 4.
                {
                    return Err(Error::Bounds);
                }
            }
        }
        self.edges.push(Edge {
            id,
            from,
            to,
            link,
            enabled: true,
            bus: 0,
        });
        Ok(())
    }
    pub fn connect_audio_port(
        &mut self,
        id: u32,
        from: u32,
        port: usize,
        to: u32,
        input: usize,
    ) -> Result<()> {
        let source = self.index(from)?;
        let p = self.nodes[source]
            .kind
            .ports()
            .get(port)
            .ok_or(Error::Contract)?;
        if p.direction != "out" || p.family != "audio" {
            return Err(Error::Contract);
        }
        let bus = if p.id == "kick.out" { 1 } else { 0 };
        self.connect(id, from, to, Link::Audio { input })?;
        self.edges.last_mut().unwrap().bus = bus;
        Ok(())
    }
    pub fn set_detector_connection(&mut self, id: u32, enabled: bool) -> Result<()> {
        let edge = self
            .edges
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or(Error::Missing)?;
        if self.nodes[edge.to].kind != Kind::Compressor
            || !matches!(edge.link, Link::Audio { input: 1 })
        {
            return Err(Error::Contract);
        }
        edge.enabled = enabled;
        Ok(())
    }
    pub fn meter(&self, id: u32, metric: usize) -> Result<f32> {
        let i = self.index(id)?;
        self.nodes[i]
            .compressor
            .as_ref()
            .ok_or(Error::Contract)?
            .meter
            .get(metric)
            .copied()
            .ok_or(Error::Bounds)
    }
    pub fn prepare(&mut self) -> Result<()> {
        self.editable()?;
        let outputs: Vec<_> = self
            .nodes
            .iter()
            .enumerate()
            .filter(|(_, n)| n.kind == Kind::Output)
            .map(|(i, _)| i)
            .collect();
        if outputs.len() != 1 {
            return Err(Error::Contract);
        }
        for (i, n) in self.nodes.iter().enumerate() {
            if n.kind == Kind::Percussion && n.version == 2 && n.percussion_kit.is_none() { return Err(Error::Contract); }
            for (port, p) in n.kind.ports().iter().enumerate() {
                if p.required
                    && !self
                        .edges
                        .iter()
                        .any(|e| e.to == i && matches!(e.link,Link::Audio{input} if input==port))
                {
                    return Err(Error::Missing);
                }
            }
        }
        self.order.clear();
        self.schedule.clear();
        while self.order.len() < self.nodes.len() {
            let next = (0..self.nodes.len())
                .find(|i| {
                    !self.order.contains(i)
                        && self
                            .edges
                            .iter()
                            .filter(|e| e.to == *i)
                            .all(|e| self.order.contains(&e.from))
                })
                .ok_or(Error::Cycle)?;
            let dependencies: Vec<_> = self
                .edges
                .iter()
                .filter(|e| e.to == next)
                .map(|e| self.nodes[e.from].id)
                .collect();
            let level = dependencies
                .iter()
                .filter_map(|id| {
                    self.schedule
                        .iter()
                        .find(|s| s.id == *id)
                        .map(|s| s.level + 1)
                })
                .max()
                .unwrap_or(0);
            self.schedule.push(ScheduleEntry {
                id: self.nodes[next].id,
                dependencies,
                level,
            });
            self.order.push(next);
        }
        // Check every immutable resource before any adapter becomes prepared.
        // A failed raw-ABI prepare remains editable and can be corrected/retried.
        // PDC allocation/validation is also complete before committing resources.
        for n in &self.nodes {
            if n.tape.as_ref().is_some_and(|t|!t.can_prepare()){return Err(Error::Contract);}
            if n.motion.is_some()&&n.fx_mask!=15{return Err(Error::Contract);}
            if n.pitched.as_ref().is_some_and(|p|!p.ready)
                || n.piano.as_ref().is_some_and(|p|!p.can_prepare())
                || n.plucked.as_ref().is_some_and(|p|!p.can_prepare())
                || n.iowa.as_ref().is_some_and(|p|!p.can_prepare())
                || n.mixer.as_ref().is_some_and(|m|!m.can_prepare())
            {return Err(Error::Contract);}
            if let Some(effect)=&n.effect {
                if n.fx_mask!=(1<<n.kind.params().len())-1
                    || n.effect_settled!=Some(n.kind==Kind::Inserts)
                    || !effect.can_prepare()
                {return Err(Error::Contract);}
            }
            if n.kind.rack()||n.kind.voice_fx() {
                if n.fx_mask!=(1<<n.kind.params().len())-1
                    || n.rack.as_ref().is_some_and(|r|!r.can_prepare())
                    || n.kind.voice_fx()&&n.voice_fx.as_ref().is_none_or(|v|!v.can_prepare())
                {return Err(Error::Contract);}
            }
            if n.kind==Kind::Classic&&n.classic.as_ref().is_none_or(|p|!p.can_prepare()) {return Err(Error::Contract);}
        }
        self.prepare_latency()?;
        for n in &mut self.nodes {if let Some(p)=&mut n.piano {if !p.prepare(){return Err(Error::Contract);}}if let Some(p)=&mut n.plucked{if !p.prepare(){return Err(Error::Contract);}}if let Some(p)=&mut n.iowa {if !p.prepare(){return Err(Error::Contract);}}}
        for n in &mut self.nodes {if let Some(effect)=&mut n.effect {if !effect.prepare(n.effect_settled.ok_or(Error::Contract)?){return Err(Error::Contract);}}if let Some(m)=&mut n.mixer{if !m.prepare(){return Err(Error::Contract);}}}
        for n in &mut self.nodes{if n.kind.rack()||n.kind.voice_fx(){if n.fx_mask!=(1<<n.kind.params().len())-1{return Err(Error::Contract);}let ok=if let Some(r)=&mut n.rack{r.prepare()}else{n.voice_fx.as_mut().ok_or(Error::Contract)?.prepare()};if !ok{return Err(Error::Contract);}}}
        for n in &mut self.nodes{if n.kind==Kind::Classic&&!n.classic.as_mut().ok_or(Error::Contract)?.prepare(){return Err(Error::Contract);}}
        for n in &mut self.nodes{if let Some(t)=&mut n.tape{if !t.prepare(){return Err(Error::Contract);}}}
        self.output = outputs[0];
        self.prepared = true;
        Ok(())
    }
    pub fn schedule(&self) -> &[ScheduleEntry] {
        &self.schedule
    }
    pub fn pitch_config(&mut self,id:u32,scope:u32,index:u32,value:f64)->Result<()> {
        self.editable()?;let i=self.index(id)?;self.nodes[i].pitched.as_mut().ok_or(Error::Contract)?.configure(pitched::Setting{scope,index,value})
    }
    pub fn pitch_performance(&mut self,id:u32,mode:u32,portamento:f32,always:bool)->Result<()> {
        self.editable()?;let i=self.index(id)?;self.nodes[i].pitched.as_mut().ok_or(Error::Contract)?.set_performance(mode,portamento,always)
    }
    pub fn pitch_point(&mut self,id:u32,frame:u64,scope:u32,index:u32,value:f64,extra:f32)->Result<()> {
        self.editable()?;let i=self.index(id)?;self.nodes[i].pitched.as_mut().ok_or(Error::Contract)?.point(frame,pitched::Setting{scope,index,value},extra)
    }
    pub fn pitch_stat(&self,id:u32,index:u32)->Result<f64> {let i=self.index(id)?;let n=&self.nodes[i];if let Some(p)=&n.plucked{Ok(p.stat(index))}else if let Some(p)=&n.classic{Ok(p.stat(index))}else if let Some(p)=&n.iowa{Ok(p.stat(index))}else if let Some(p)=&n.piano{Ok(p.stat(index))}else{Ok(n.pitched.as_ref().ok_or(Error::Contract)?.stat(index))}}
    pub fn plucked_edit(&mut self,id:u32)->Result<&mut calmbgm_plucked_voice::voice::Engine>{self.editable()?;let i=self.index(id)?;self.nodes[i].plucked.as_deref_mut().ok_or(Error::Contract)}
    pub fn iowa_edit(&mut self,id:u32)->Result<&mut calmbgm_iowa::Engine>{self.editable()?;let i=self.index(id)?;self.nodes[i].iowa.as_mut().map(|p|p.as_mut()).ok_or(Error::Contract)}
    pub fn piano_edit(&mut self,id:u32)->Result<&mut calmbgm_piano::voice::Engine>{self.editable()?;let i=self.index(id)?;self.nodes[i].piano.as_mut().map(|p|p.as_mut()).ok_or(Error::Contract)}
    pub fn piano_control_edit(&mut self,id:u32)->Result<&mut calmbgm_piano::voice::Engine>{let i=self.index(id)?;if !matches!(self.nodes[i].version,2|3){return Err(Error::Contract);}self.piano_edit(id)}
    pub fn piano_lifetime_edit(&mut self,id:u32)->Result<&mut calmbgm_piano::voice::Engine>{let i=self.index(id)?;if self.nodes[i].version!=3{return Err(Error::Contract);}self.piano_edit(id)}
    pub fn percussion_stat(&self,id:u32,index:u32)->Result<f64> {let i=self.index(id)?;Ok(self.nodes[i].percussion.as_ref().ok_or(Error::Contract)?.stat(index))}
    pub fn node_buffer(&self,id:u32)->Result<&[[f32;2]]> {Ok(&self.nodes[self.index(id)?].buffer)}
    pub fn enqueue(&mut self, mut e: Event) -> Result<()> {
        if !self.prepared {
            return Err(Error::State);
        }
        if e.frame > MAX_FRAME {
            return Err(Error::Frame);
        }
        let i = self.index(e.target)?;
        if e.owner==0{return Err(Error::Contract);}
        match e.action {
            Action::Cancel=>{if self.nodes[i].plucked.is_none()&&self.nodes[i].classic.is_none()&&self.nodes[i].iowa.is_none()&&self.nodes[i].piano.is_none()&&self.nodes[i].pitched.is_none(){return Err(Error::Contract);}}
            Action::Classic{kind,id,a,b}=>{if !self.nodes[i].classic.as_ref().ok_or(Error::Contract)?.valid(&classic_source::Event{frame:e.frame,owner:e.owner,kind,id,a,b}){return Err(Error::Contract);}},
            Action::FxParam{param,value}=>{if self.nodes[i].motion.is_none()&&e.frame%128!=0||!self.valid_fx_param(i,param,value){return Err(Error::Contract);}},
            Action::Note{kind,id,a,b}=>{
                if kind==0&&e.frame<self.frame&&(self.nodes[i].plucked.is_some()||self.nodes[i].kind==Kind::Piano&&self.nodes[i].version==3){return Err(Error::Frame);}
                if kind==0&&(self.nodes[i].plucked.is_some()||self.nodes[i].kind==Kind::Piano&&self.nodes[i].version==3)&&self.events.iter().any(|x|x.target==e.target&&matches!(x.action,Action::Note{kind:0,id:n,..}if n==id)){return Err(Error::Contract);}
                let conflict=if let Some(p)=&self.nodes[i].plucked{if !p.valid(kind,id,a,b,e.frame){return Err(Error::Contract);}p.conflict(id,e.owner)}else if let Some(p)=&self.nodes[i].iowa {if !p.valid(kind,id,a,b,e.frame){return Err(Error::Contract);}p.conflict(id,e.owner)}else if let Some(p)=&self.nodes[i].piano {if !p.valid(kind,id,a,b,e.frame){return Err(Error::Contract);}p.conflict(id,e.owner)}else{self.nodes[i].pitched.as_ref().ok_or(Error::Contract)?.conflict(id,e.owner)};
                if !valid_note(kind,id,a,b)||(matches!(kind,0|1|3|5)&&id!=0&&(conflict||self.events.iter().any(|x|x.target==e.target&&x.owner!=e.owner&&matches!(x.action,Action::Note{kind:k,id:n,..} if matches!(k,0|1|3|5)&&n==id)))){return Err(Error::Contract);}
                if self.events.iter().filter(|x|x.target==e.target&&matches!(x.action,Action::Note{..})).count()>=4000{return Err(Error::QueueFull);}
            }
            Action::Param { param, value } => {if self.nodes[i].kind.mixer()||self.nodes[i].kind.rack()||self.nodes[i].kind.voice_fx()||matches!(self.nodes[i].kind,Kind::Motion|Kind::Tape){return Err(Error::Contract);}self.valid_param(i,param,value)?;if matches!(self.nodes[i].kind,Kind::Inserts|Kind::SendEffects)&&e.frame%128!=0{return Err(Error::Contract);}},
            Action::MixerParam{param,value}=>{if !self.nodes[i].mixer.as_ref().ok_or(Error::Contract)?.valid(param,value){return Err(Error::Contract);}},
            Action::Gate(_) => {
                if self.nodes[i].kind != Kind::Tone || e.owner == 0 {
                    return Err(Error::Contract);
                }
            }
            Action::ModEnabled { edge, .. } => {
                if !self
                    .edges
                    .iter()
                    .any(|a| a.id == edge && a.to == i && matches!(a.link, Link::Mod { .. }))
                {
                    return Err(Error::Contract);
                }
            }
            Action::ConnectionEnabled { edge, .. } => {
                if !self.edges.iter().any(|e| {
                    e.id == edge
                        && e.to == i
                        && self.nodes[i].kind == Kind::Compressor
                        && matches!(e.link, Link::Audio { input: 1 })
                }) {
                    return Err(Error::Contract);
                }
            }
            Action::Hit(h) => {
                if self.nodes[i].kind != Kind::Percussion
                    || e.owner == 0
                    || h.drum >= 14
                    || h.model > 2
                    || !h.velocity.is_finite()
                    || !(0. ..=1.).contains(&h.velocity)
                    || !h.duration.is_finite()
                    || !(0. ..=30.).contains(&h.duration)
                    || !h.vary.is_finite()
                    || h.vary.abs() > 1.
                    || !h.tone.is_finite()
                    || h.tone.abs() > 1.
                    || !h.decay.is_finite()
                    || !(0.5..=2.).contains(&h.decay)
                {
                    return Err(Error::Contract);
                }
            }
        }
        if self.events.len() == MAX_EVENTS {
            self.stats.overflow += 1;
            return Err(Error::QueueFull);
        }
        if e.frame < self.frame {
            e.frame = if self.nodes[i].kind==Kind::Iowa&&matches!(e.action,Action::Note{..})||matches!(self.nodes[i].kind,Kind::Inserts|Kind::SendEffects)&&matches!(e.action,Action::Param{..})||self.nodes[i].motion.is_none()&&matches!(e.action,Action::FxParam{..}) {self.frame.div_ceil(128)*128}else{self.frame};
            if e.frame>MAX_FRAME{return Err(Error::Frame);}
            self.stats.late += 1;
        }
        if let Action::Classic{kind,id,a,b}=e.action{let p=self.nodes[i].classic.as_mut().unwrap();let generated=p.generated_frame();let original=e.frame;if !p.enqueue(classic_source::Event{frame:original,owner:e.owner,kind,id,a,b}){return Err(Error::Contract);}if e.frame<generated{e.frame=generated;self.stats.late+=1;}}
        // Preserve the legacy engine's receive-order serial numbers, including
        // out-of-order future bookings: they affect deterministic voice stealing.
        // The graph queue still bounds ownership, timestamps and applied stats.
        if let Action::Hit(h) = e.action {
            if !self.nodes[i]
                .percussion
                .as_mut()
                .unwrap()
                .trigger(e.frame, e.owner, h)
            {
                self.stats.overflow += 1;
                return Err(Error::QueueFull);
            }
        }
        // Stable receive order for identical timestamps. No sort/allocation in render.
        let at = self
            .events
            .iter()
            .position(|a| a.frame > e.frame)
            .unwrap_or(self.events.len());
        self.events.insert(at, e);
        Ok(())
    }
    /// Cancel an owner's queued events and release only its held gates.
    pub fn cancel_owner(&mut self, owner: u32) {
        self.events.retain(|e| e.owner != owner);
        for n in &mut self.nodes {
            if let Some(p)=&mut n.plucked{p.cancel(owner);}
            if let Some(p)=&mut n.classic{p.cancel(owner);}
            if let Some(p)=&mut n.pitched {p.cancel(owner);}
            if let Some(p)=&mut n.piano {p.cancel(owner);}if let Some(p)=&mut n.iowa{p.cancel(owner);}
            if let Some(p) = &mut n.percussion {
                p.cancel_owner(owner);
            }
            if n.gate_owner == Some(owner) {
                n.gate_owner = None;
            }
        }
    }
    pub fn reset(&mut self) {
        self.frame = 0;
        self.stats = Stats::default();
        self.events.clear();
        for d in &mut self.edge_delays {d.reset();}
        for n in &mut self.nodes {
            if let Some(m)=&mut n.mixer{m.reset();}
            if let Some(p)=&mut n.classic{p.reset();}
            if let Some(p)=&mut n.plucked{p.reset();}
            if let Some(m)=&mut n.motion{m.reset();}
            if let Some(t)=&mut n.tape{t.reset();}if let Some(p)=&mut n.rack{p.reset();}if let Some(p)=&mut n.voice_fx{p.reset();}
            if let Some(effect)=&mut n.effect {effect.reset();}
            if let Some(delay)=&mut n.delay {delay.reset();}
            if let Some(p)=&mut n.pitched {p.reset();}
            if let Some(p)=&mut n.piano {p.reset();}if let Some(p)=&mut n.iowa{p.reset();}
            n.buffer.fill([0.; 2]);
            n.kick.fill([0.; 2]);
            if let Some(p) = &mut n.percussion {
                p.reset();
                if let Some(kit) = n.percussion_kit { p.configure_kit(kit); }
            }
            if let Some(c) = &mut n.compressor {
                c.reset();
            }
            n.phase = 0.;
            n.gate_owner = None;
        }
    }
    pub fn base(&self, id: u32, param: usize) -> Result<f32> {
        let i = self.index(id)?;
        self.valid_param(
            i,
            param,
            self.nodes[i]
                .base
                .get(param)
                .copied()
                .ok_or(Error::Contract)?,
        )?;
        Ok(self.nodes[i].base[param])
    }
    /// Host writes interleaved stereo before render; render consumes/clears it.
    pub fn input_buffer(&mut self, id: u32) -> Result<&mut [[f32; 2]]> {
        let i = self.index(id)?;
        if self.nodes[i].kind != Kind::HostInput {
            return Err(Error::Contract);
        }
        Ok(&mut self.nodes[i].buffer)
    }
    pub fn kick_buffer(&self, id: u32) -> Result<&[[f32; 2]]> {
        let i = self.index(id)?;
        if self.nodes[i].kind != Kind::Percussion {
            return Err(Error::Contract);
        }
        Ok(&self.nodes[i].kick)
    }
    fn clear_host_inputs(&mut self) {
        for n in &mut self.nodes {
            if n.kind == Kind::HostInput {
                n.buffer.fill([0.; 2]);
            }
        }
    }
    pub fn output(&self, frames: usize) -> (&[f32], &[f32]) {
        (&self.left[..frames], &self.right[..frames])
    }
    pub fn render(&mut self, frames: usize) -> Result<()> {
        if !self.prepared {
            return Err(Error::State);
        }
        if frames > self.max_block || self.frame > MAX_FRAME - frames as u64 {
            return Err(Error::Bounds);
        }
        if self.paused {
            self.clear_host_inputs();
            for n in &mut self.nodes {n.buffer[..frames].fill([0.;2]);if !n.kick.is_empty(){n.kick[..frames].fill([0.;2]);}}
            self.left[..frames].fill(0.);
            self.right[..frames].fill(0.);
            return Ok(());
        }
        for n in &mut self.nodes {
            if let Some(t)=&mut n.tape{t.begin_block();}
            if let Some(m)=&mut n.motion{m.begin_block();}
            if let Some(c) = &mut n.compressor {
                c.begin_block();
            }
        }
        let mut start=0;
        while start<frames {
            while self.events.first().is_some_and(|e| e.frame <= self.frame) {
                let e = self.events.remove(0);
                let i = self.index(e.target)?;
                match e.action {
                    Action::FxParam{param,value}=>{let n=&mut self.nodes[i];let ok=if let Some(t)=&mut n.tape{t.param(param,value)}else if let Some(m)=&mut n.motion{m.param(param,value)}else if let Some(r)=&mut n.rack{r.param(param,value)}else{n.voice_fx.as_mut().unwrap().param(param,value)};if !ok{return Err(Error::Contract);}n.base[param]=value as f32;},
                    Action::Classic{kind,..}=>{if kind==4{self.events.retain(|x|!(x.target==e.target&&matches!(x.action,Action::Classic{..})));}},
                    Action::MixerParam{param,value}=>{if !self.nodes[i].mixer.as_mut().unwrap().param(param,value){return Err(Error::Contract);}self.nodes[i].base[param]=value as f32;},
                    Action::Param { param, value } => {self.nodes[i].base[param] = value;if let Some(effect)=&mut self.nodes[i].effect {if !effect.param(param,value){return Err(Error::Contract);}}},
                    Action::Gate(on) => {
                        if on {
                            self.nodes[i].gate_owner = Some(e.owner);
                        } else if self.nodes[i].gate_owner == Some(e.owner) {
                            self.nodes[i].gate_owner = None;
                        }
                    }
                    Action::ModEnabled { edge, enabled } => {
                        self.edges
                            .iter_mut()
                            .find(|a| a.id == edge)
                            .unwrap()
                            .enabled = enabled;
                    }
                    Action::ConnectionEnabled { edge, enabled } => {
                        self.set_detector_connection(edge, enabled)?;
                    }
                    Action::Cancel=>self.cancel_owner(e.owner),
                    Action::Note{kind,id,a,b}=>{if kind==4 {self.events.retain(|x|!(x.target==e.target&&matches!(x.action,Action::Note{..})));}if let Some(p)=&mut self.nodes[i].plucked{if !p.note(kind,id,e.owner,e.frame){return Err(Error::Contract);}}else if let Some(p)=&mut self.nodes[i].iowa{p.note(kind,id,e.owner);}else if let Some(p)=&mut self.nodes[i].piano {if !p.note(kind,id,e.owner,e.frame){return Err(Error::Contract);}}else if kind==4{self.nodes[i].pitched.as_mut().unwrap().panic();}else{self.nodes[i].pitched.as_mut().unwrap().note(kind,id,e.owner,e.frame,a,b)?;}}
                    Action::Hit(_) => {} // The owned engine executes its booked hit in tick().
                }
                self.stats.applied += 1;
            }
            let length=(frames-start).min(self.events.first().map_or(usize::MAX,|e|(e.frame-self.frame)as usize));
            for n in &mut self.nodes {if let Some(p)=&mut n.plucked{p.render(self.frame,&mut n.buffer[start..start+length]);}if let Some(p)=&mut n.classic{if !p.render(self.frame,&mut n.buffer[start..start+length]){return Err(Error::Contract);}}if let Some(p)=&mut n.pitched{p.render(self.frame,&mut n.buffer[start..start+length])?;}if let Some(p)=&mut n.piano{p.render(self.frame,&mut n.buffer[start..start+length]);}if let Some(p)=&mut n.iowa{p.render(self.frame,&mut n.buffer[start..start+length]);}}
            for sample in start..start+length {
            for &i in &self.order {
                // Preserve separate program/key-capable input buses. Only Mix sums
                // them; future detector ports must never enter an implicit sum.
                let mut inputs = [[0.; 2]; 3];
                let mut modulation = 0.;
                let mut key_connected = false;
                for (edge_index,e) in self.edges.iter().enumerate().filter(|(_,e)|e.to==i) {
                    let source = if e.bus == 1 {
                        self.nodes[e.from].kick[sample]
                    } else {
                        self.nodes[e.from].buffer[sample]
                    };
                    let source=self.edge_delays[edge_index].tick(source);
                    if !e.enabled {continue;}
                    match e.link {
                        Link::Audio { input } => {
                            inputs[input] = source;
                            if input == 1 {
                                key_connected = true;
                            }
                        }
                        Link::Mod {
                            depth,
                            offset,
                            unipolar,
                            ..
                        } => {
                            modulation += offset
                                + depth
                                    * (if unipolar {
                                        (source[0] + 1.) * 0.5
                                    } else {
                                        source[0]
                                    })
                        }
                    }
                }
                let n = &mut self.nodes[i];
                n.buffer[sample] = match n.kind {
                    Kind::Tone => {
                        let level = if n.gate_owner.is_some() {
                            n.base[1]
                        } else {
                            0.
                        };
                        let a = n.phase * TAU;
                        let out = [a.sin() as f32 * level, a.cos() as f32 * level];
                        n.phase = (n.phase + n.base[0] as f64 / self.sample_rate).fract();
                        out
                    }
                    Kind::Lfo => {
                        let out = [(n.phase * TAU).sin() as f32, 0.];
                        n.phase = (n.phase + n.base[0] as f64 / self.sample_rate).fract();
                        out
                    }
                    Kind::Vca => {
                        let gain = (n.base[0] + modulation).clamp(0., 2.);
                        [inputs[0][0] * gain, inputs[0][1] * gain]
                    }
                    Kind::Mix => [
                        (inputs[0][0] + inputs[1][0]) * n.base[0],
                        (inputs[0][1] + inputs[1][1]) * n.base[0],
                    ],
                    Kind::Output => inputs[0],
                    Kind::Inserts|Kind::SendEffects=>n.effect.as_mut().unwrap().tick(inputs),
                    Kind::Delay=>n.delay.as_mut().unwrap().tick(inputs[0]),
                    Kind::DeskStrip|Kind::DeskMatrix|Kind::DeskFader|Kind::DeskLimiter=>n.mixer.as_mut().unwrap().tick(inputs[0]),
                    Kind::Crusher|Kind::Pitch|Kind::ZPlane=>n.rack.as_mut().unwrap().tick(inputs[0]),
                    Kind::Shimmer|Kind::Freeze=>n.voice_fx.as_mut().unwrap().tick(inputs[0]),
                    Kind::Motion=>n.motion.as_mut().unwrap().tick(inputs[0]),
                    Kind::Tape=>n.tape.as_mut().unwrap().tick(inputs[0]),
                    Kind::Core|Kind::Fm|Kind::Piano|Kind::Iowa|Kind::Classic|Kind::Plucked=>{let gain=(n.base[0]+modulation).clamp(0.,2.);[n.buffer[sample][0]*gain,n.buffer[sample][1]*gain]},
                    Kind::HostInput => n.buffer[sample].map(|v| if v.is_finite() { v } else { 0. }),
                    Kind::Percussion => {
                        let (audio, kick) = n.percussion.as_mut().unwrap().tick_with_kick();
                        n.kick[sample] = if n.base[1] == 0. || n.base[3] == 1. {
                            kick
                        } else {
                            [0.; 2]
                        };
                        let gain = if n.base[1] == 0. && n.base[2] == 0. {
                            (n.base[0] + modulation).clamp(0., 2.)
                        } else {
                            0.
                        };
                        [audio[0] * gain, audio[1] * gain]
                    }
                    Kind::Compressor => n.compressor.as_mut().unwrap().tick(
                        inputs[0],
                        inputs[1],
                        key_connected,
                        &n.base,
                    ),
                };
            }
            self.left[sample] = self.nodes[self.output].buffer[sample][0];
            self.right[sample] = self.nodes[self.output].buffer[sample][1];
            self.frame += 1;
            }
            start+=length;
        }
        self.clear_host_inputs();
        Ok(())
    }
}

#[cfg(target_arch = "wasm32")]
mod abi;
