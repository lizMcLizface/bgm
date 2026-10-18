import React from 'react';
import Slider from './Slider';
import {NEUTRAL_EXPRESSION} from './config';

export default function Expression({values,onChange,kind}){
 return <><div className="lab-expression-tools"><button type="button" onClick={()=>onChange(NEUTRAL_EXPRESSION)}>Reset expression</button><small>Click a value or double-click a slider to reset. Centred controls snap to zero.</small></div><div className="lab-macros">{[['pressure','Pressure · hold expression',0,1],['brightness','Brightness',-1,1],['texture','Texture',0,1],['motion','Vibrato / motion',0,1],['bend','Pitch bend',-2,2],['level','Expression level',0,1]].map(([id,label,min,max])=><Slider key={id} label={label} disabled={(kind==='legacy'&&['pressure','texture','bend'].includes(id))||(kind==='procedural'&&['pressure','texture'].includes(id))} neutral={NEUTRAL_EXPRESSION[id]} value={values[id]} min={min} max={max} onChange={v=>onChange({[id]:v})}/>)}</div><p className="lab-hint">These controls affect held notes on the played voice and its runner part. They work without piano aftertouch. Previous voices support brightness, motion and level. Prepared sources also support pitch bend; contact softness and body are in the patch JSON and shape new strikes. Pressure and texture require an oscillator/FM source. CC1 = motion, CC11 = level, CC74 = brightness.</p></>;
}
