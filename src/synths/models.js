// Every playable /synths model: kernel model id, parameter table and factory sounds.
import {MODELS} from './engine/offline';
import * as cs80Params from './cs80/params';
import {PRESETS as CS80_PRESETS} from './cs80/presets';
import * as junoParams from './juno/params';
import {PRESETS as JUNO_PRESETS} from './juno/presets';

export const SYNTHS={
 cs80:{id:'cs80',model:MODELS.cs80,name:'CS-80',subtitle:'inspired polysynth',params:cs80Params,presets:CS80_PRESETS},
 juno:{id:'juno',model:MODELS.juno,name:'Juno-106',subtitle:'inspired polysynth',params:junoParams,presets:JUNO_PRESETS},
};
