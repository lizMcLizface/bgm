// Every playable /synths model: kernel model id, parameter table and factory sounds.
import {MODELS} from './engine/offline';
import * as cs80Params from './cs80/params';
import {PRESETS as CS80_PRESETS} from './cs80/presets';
import * as junoParams from './juno/params';
import {PRESETS as JUNO_PRESETS} from './juno/presets';
import * as prophetParams from './prophet/params';
import {PRESETS as PROPHET_PRESETS} from './prophet/presets';
import * as jupiterParams from './jupiter/params';
import {PRESETS as JUPITER_PRESETS} from './jupiter/presets';
import * as minimoogParams from './minimoog/params';
import {PRESETS as MINIMOOG_PRESETS} from './minimoog/presets';
import * as dx7Params from './dx7/params';
import {PRESETS as DX7_PRESETS} from './dx7/presets';
import * as obxaParams from './obxa/params';
import {PRESETS as OBXA_PRESETS} from './obxa/presets';
import * as vsParams from './vs/params';
import {PRESETS as VS_PRESETS} from './vs/presets';

export const SYNTHS={
 cs80:{id:'cs80',model:MODELS.cs80,name:'CS-80',subtitle:'inspired polysynth',params:cs80Params,presets:CS80_PRESETS},
 juno:{id:'juno',model:MODELS.juno,name:'Juno-106',subtitle:'inspired polysynth',params:junoParams,presets:JUNO_PRESETS},
 prophet5:{id:'prophet5',model:MODELS.prophet5,name:'Prophet-5',subtitle:'inspired polysynth',params:prophetParams,presets:PROPHET_PRESETS},
 jupiter8:{id:'jupiter8',model:MODELS.jupiter8,name:'Jupiter-8',subtitle:'inspired polysynth',params:jupiterParams,presets:JUPITER_PRESETS},
 minimoog:{id:'minimoog',model:MODELS.minimoog,name:'Minimoog',subtitle:'inspired monosynth',params:minimoogParams,presets:MINIMOOG_PRESETS},
 dx7:{id:'dx7',model:MODELS.dx7,name:'DX7',subtitle:'inspired FM synth',params:dx7Params,presets:DX7_PRESETS},
 obxa:{id:'obxa',model:MODELS.obxa,name:'OB-Xa',subtitle:'inspired polysynth',params:obxaParams,presets:OBXA_PRESETS},
 vs:{id:'vs',model:MODELS.vs,name:'Prophet VS',subtitle:'inspired vector synth',params:vsParams,presets:VS_PRESETS},
};
