//! Portable M1 reference executor. Preparation allocates; render and enqueue do not.
//! No legacy ABI, mutable globals, Web Audio, shared memory or platform clock.
use std::f64::consts::TAU;
#[cfg(feature = "allocation-audit")]
mod allocation_audit;
mod compressor;
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
            Self::HostInput => &[],
            Self::Core | Self::Fm => &PITCH_PARAMS,
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
            Self::Core | Self::Fm => &TONE_PORTS,
        }
    }
}
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
    ] {
        let params: Vec<_> = kind.params().iter().enumerate().map(|(code,p)| format!(r#"{{"id":"{}","code":{},"unit":"{}","min":{},"max":{},"default":{},"rate":"{}","modulation":{},"smoothingMs":{}}}"#,p.id,code,p.unit,p.min,p.max,p.default,if p.unit=="boolean"||p.unit=="enum"{"event"}else{"audio"},p.modulation,if kind==Kind::Compressor && [5,6,9].contains(&code){5}else{0})).collect();
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
        if matches!(kind,Kind::Core|Kind::Fm) {events.push("\"note\"");events.push("\"cancel\"");}
        let processing=if matches!(kind,Kind::Core|Kind::Fm){",\"processing\":\"prepared blocks\",\"configuration\":\"owned pitched spec v1; notes in graph events\",\"maxNoteEvents\":4000,\"maxAutomationPoints\":65536,\"latencyPolicy\":\"query prepared instance; FM reconstruction depends on quality\""}else if kind==Kind::Percussion{r#", "kitConfiguration":{"version":1,"voices":["felt","crisp","tr808","hand"],"slots":14,"immutableAfterPrepare":true,"absent":"raw hits; event model/tone/decay","initialLevels":"unity; legacy 20 ms target smoothing","reset":"retain kit; restore initial unity levels","fields":{"level":{"min":0,"max":2},"tone":{"min":-1,"max":1},"decay":{"min":0.5,"max":2}}}"#}else{""};
        let descriptor=format!(r#"{{"type":"{}","code":{},"version":1,"hostInput":{},"latencyFrames":{},"tailFrames":{},"tailPolicy":"{}","bypass":"{}","reset":"phase and voices cleared; compressor gain reset","ports":[{}],"parameters":[{}],"events":[{}]{}}}"#,kind.name(),kind as u32,kind==Kind::HostInput,if kind==Kind::Fm{"null"}else{"0"},if matches!(kind,Kind::Percussion|Kind::Core|Kind::Fm){-1}else{0},if kind==Kind::Percussion{"event dependent, at most 8.1 seconds; -1 denotes variable frames"}else if matches!(kind,Kind::Core|Kind::Fm){"patch and held-note dependent"}else{"none"},if kind==Kind::Compressor{"5 ms unity crossfade"}else{"unsupported"},ports.join(","),params.join(","),events.join(","),processing);
        if kind==Kind::Percussion {
            // v1 stays raw. v2 requires the kit so older runtimes fail closed.
            modules.push(descriptor.replace(processing,""));
            modules.push(descriptor.replacen("\"version\":1","\"version\":2",1));
        } else { modules.push(descriptor); }
    }
    format!(
        r#"{{"api":1,"patchVersion":1,"maxNodes":{},"maxEdges":{},"maxEvents":{},"maxBlock":{},"modules":[{}]}}"#,
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
    base: [f32; 10],
    phase: f64,
    gate_owner: Option<u32>,
    buffer: Vec<[f32; 2]>,
    kick: Vec<[f32; 2]>,
    percussion: Option<Box<calmbgm_percussion::Engine>>,
    percussion_kit: Option<KitConfig>,
    compressor: Option<Box<compressor::Compressor>>,
    pitched: Option<Box<pitched::Pitched>>,
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
        if !(version == 1 || kind == Kind::Percussion && version == 2) || id == 0 {
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
        let mut base = [0.; 10];
        for (i, p) in kind.params().iter().enumerate() {
            base[i] = p.default;
        }
        if matches!(kind,Kind::Core|Kind::Fm)&&self.nodes.iter().filter(|n|matches!(n.kind,Kind::Core|Kind::Fm)).count()>=8{return Err(Error::Bounds);}
        self.nodes.push(Node {
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
            || (p.unit == "Hz" && value as f64 >= self.sample_rate / 2.)
        {
            return Err(Error::Bounds);
        }
        Ok(())
    }
    pub fn set_base(&mut self, id: u32, param: usize, value: f32) -> Result<()> {
        self.editable()?;
        let i = self.index(id)?;
        self.valid_param(i, param, value)?;
        self.nodes[i].base[param] = value;
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
        if self.nodes.iter().any(|n|n.pitched.as_ref().is_some_and(|p|!p.ready)){return Err(Error::Contract);}
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
    pub fn pitch_stat(&self,id:u32,index:u32)->Result<f64> {let i=self.index(id)?;Ok(self.nodes[i].pitched.as_ref().ok_or(Error::Contract)?.stat(index))}
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
            Action::Cancel=>{if self.nodes[i].pitched.is_none(){return Err(Error::Contract);}}
            Action::Note{kind,id,a,b}=>{
                let p=self.nodes[i].pitched.as_ref().ok_or(Error::Contract)?;
                if !valid_note(kind,id,a,b)||(matches!(kind,0|1|3|5)&&id!=0&&(p.conflict(id,e.owner)||self.events.iter().any(|x|x.target==e.target&&x.owner!=e.owner&&matches!(x.action,Action::Note{kind:k,id:n,..} if matches!(k,0|1|3|5)&&n==id)))){return Err(Error::Contract);}
                if self.events.iter().filter(|x|x.target==e.target&&matches!(x.action,Action::Note{..})).count()>=4000{return Err(Error::QueueFull);}
            }
            Action::Param { param, value } => self.valid_param(i, param, value)?,
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
            e.frame = self.frame;
            self.stats.late += 1;
        }
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
            if let Some(p)=&mut n.pitched {p.cancel(owner);}
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
        for n in &mut self.nodes {
            if let Some(p)=&mut n.pitched {p.reset();}
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
                    Action::Param { param, value } => self.nodes[i].base[param] = value,
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
                    Action::Note{kind,id,a,b}=>{if kind==4 {self.events.retain(|x|!(x.target==e.target&&matches!(x.action,Action::Note{..})));self.nodes[i].pitched.as_mut().unwrap().panic();}else{self.nodes[i].pitched.as_mut().unwrap().note(kind,id,e.owner,e.frame,a,b)?;}}
                    Action::Hit(_) => {} // The owned engine executes its booked hit in tick().
                }
                self.stats.applied += 1;
            }
            let length=(frames-start).min(self.events.first().map_or(usize::MAX,|e|(e.frame-self.frame)as usize));
            for n in &mut self.nodes {if let Some(p)=&mut n.pitched{p.render(self.frame,&mut n.buffer[start..start+length])?;}}
            for sample in start..start+length {
            for &i in &self.order {
                // Preserve separate program/key-capable input buses. Only Mix sums
                // them; future detector ports must never enter an implicit sum.
                let mut inputs = [[0.; 2]; 2];
                let mut modulation = 0.;
                let mut key_connected = false;
                for e in self.edges.iter().filter(|e| e.to == i && e.enabled) {
                    let source = if e.bus == 1 {
                        self.nodes[e.from].kick[sample]
                    } else {
                        self.nodes[e.from].buffer[sample]
                    };
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
                    Kind::Core|Kind::Fm=>{let gain=(n.base[0]+modulation).clamp(0.,2.);[n.buffer[sample][0]*gain,n.buffer[sample][1]*gain]},
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
