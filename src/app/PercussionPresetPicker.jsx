import React,{useState} from 'react';
import PresetPicker from './editor/PresetPicker';
import {percussionVoice,percussionEdited} from './percussionVoices';

export default function PercussionPresetPicker({value,kit,onChange,disabled=false,open,onOpenChange}) {
    const voice=percussionVoice(value),edited=percussionEdited(value,kit);
    const [busy,setBusy]=useState(false),[error,setError]=useState('');
    const reset=async()=>{if(busy||disabled)return;setBusy(true);setError('');try{await onChange(voice.id);}catch(e){setError(e.message);}finally{setBusy(false);}};
    return <div className="gen-percussion-preset">
        <label className="gen-field"><span>Preset</span>
            <PresetPicker role="perc" value={voice.id} edited={edited} onChange={onChange} disabled={busy||disabled} open={open} onOpenChange={onOpenChange}/>
        </label>
        <small>{voice.description}</small>
        <button type="button" disabled={busy||disabled||!edited} onClick={()=>void reset()}>Reset kit preset</button>
        {error&&<small role="alert">{error}</small>}
    </div>;
}
