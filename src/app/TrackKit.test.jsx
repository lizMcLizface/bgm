import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {TrackStrip} from './Tracks';
test('the percussion track opens the sound browser like other tracks, with a separate sound-edit button',async()=>{
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 try{
  const open=vi.fn(),edit=vi.fn();await act(async()=>root.render(<TrackStrip roles={{perc:{label:'Percussion'}}} presets={{perc:{name:'Felt'}}} mix={{perc:{mute:false,solo:false}}} onMix={()=>{}} onPickPercussion={open} onEditPercussion={edit} live={{}}/>));
  expect(node.querySelector('select')).toBeNull();await act(async()=>node.querySelector('.gen-track-name').click());expect(open).toHaveBeenCalledWith('perc');expect(edit).not.toHaveBeenCalled();
  await act(async()=>node.querySelector('[aria-label="Edit Percussion sound"]').click());expect(edit).toHaveBeenCalledWith('perc');expect(open).toHaveBeenCalledTimes(1);
 }finally{act(()=>root.unmount());node.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
