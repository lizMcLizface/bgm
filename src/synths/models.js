// Every playable /synths instrument. Numeric model IDs belong to the classics
// kernel; the DIY pages supply hosts for the existing subtractive/FM backends.
import {MODELS} from './engine/offline';
import * as cs80Params from './cs80/params';
import {PRESETS as CS80_PRESETS,CATEGORIES as CS80_CATEGORIES} from './cs80/presets';
import * as junoParams from './juno/params';
import {PRESETS as JUNO_PRESETS,CATEGORIES as JUNO_CATEGORIES} from './juno/presets';
import * as prophetParams from './prophet/params';
import {PRESETS as PROPHET_PRESETS,CATEGORIES as PROPHET_CATEGORIES} from './prophet/presets';
import * as jupiterParams from './jupiter/params';
import {PRESETS as JUPITER_PRESETS,CATEGORIES as JUPITER_CATEGORIES} from './jupiter/presets';
import * as minimoogParams from './minimoog/params';
import {PRESETS as MINIMOOG_PRESETS,CATEGORIES as MINIMOOG_CATEGORIES} from './minimoog/presets';
import * as dx7Params from './dx7/params';
import {PRESETS as DX7_PRESETS,CATEGORIES as DX7_CATEGORIES,generate as DX7_GENERATE,GENERATES as DX7_GENERATES} from './dx7/presets';
import * as obxaParams from './obxa/params';
import {PRESETS as OBXA_PRESETS,CATEGORIES as OBXA_CATEGORIES} from './obxa/presets';
import * as vsParams from './vs/params';
import {PRESETS as VS_PRESETS,CATEGORIES as VS_CATEGORIES,generate as VS_GENERATE,GENERATES as VS_GENERATES} from './vs/presets';
import {KITS,drumParams,drumPresets,CATEGORIES as DRUM_CATEGORIES} from './drums/kits';
import * as tb303Params from './tb303/params';
import {PRESETS as TB303_PRESETS,CATEGORIES as TB303_CATEGORIES} from './tb303/presets';
import {POLY,FM} from './diy/patches';

const drums=kit=>{const params=drumParams(kit);return {id:kit.id,model:kit.model,name:kit.name,subtitle:kit.subtitle,params,presets:drumPresets(kit,params),categories:DRUM_CATEGORIES,kit};};

export const SYNTHS={
 poly:{id:'poly',name:'DIY Poly',subtitle:'polyphonic subtractive synth',params:POLY.params,presets:POLY.presets,categories:POLY.categories},
 fm:{id:'fm',name:'DIY FM',subtitle:'4 / 6 operator FM synth',params:FM.params,presets:FM.presets,categories:FM.categories},
 cs80:{id:'cs80',model:MODELS.cs80,name:'V 80',subtitle:'two-tier polysynth',params:cs80Params,presets:CS80_PRESETS,categories:CS80_CATEGORIES},
 juno:{id:'juno',model:MODELS.juno,name:'Analog 106',subtitle:'DCO polysynth',params:junoParams,presets:JUNO_PRESETS,categories:JUNO_CATEGORIES},
 prophet5:{id:'prophet5',model:MODELS.prophet5,name:'Oracle 5',subtitle:'analog polysynth',params:prophetParams,presets:PROPHET_PRESETS,categories:PROPHET_CATEGORIES},
 jupiter8:{id:'jupiter8',model:MODELS.jupiter8,name:'Pluto 8',subtitle:'analog polysynth',params:jupiterParams,presets:JUPITER_PRESETS,categories:JUPITER_CATEGORIES},
 minimoog:{id:'minimoog',model:MODELS.minimoog,name:'Mercury D',subtitle:'analog monosynth',params:minimoogParams,presets:MINIMOOG_PRESETS,categories:MINIMOOG_CATEGORIES},
 dx7:{id:'dx7',model:MODELS.dx7,name:'FM7',subtitle:'six-operator FM synth',params:dx7Params,presets:DX7_PRESETS,categories:DX7_CATEGORIES,generate:DX7_GENERATE,generates:DX7_GENERATES},
 obxa:{id:'obxa',model:MODELS.obxa,name:'Oberon Xa',subtitle:'analog polysynth',params:obxaParams,presets:OBXA_PRESETS,categories:OBXA_CATEGORIES},
 vs:{id:'vs',model:MODELS.vs,name:'VectorVS',subtitle:'vector synth',params:vsParams,presets:VS_PRESETS,categories:VS_CATEGORIES,generate:VS_GENERATE,generates:VS_GENERATES},
 tr808:drums(KITS.tr808),
 tr909:drums(KITS.tr909),
 tr606:drums(KITS.tr606),
 tb303:{id:'tb303',model:MODELS.tb303,name:'Silverbox',subtitle:'bass line',params:tb303Params,presets:TB303_PRESETS,categories:TB303_CATEGORIES},
};
