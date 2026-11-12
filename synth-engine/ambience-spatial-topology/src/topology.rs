//! Explicit authored input-bus topology. No PCM silence detector or Native
//! deferred-output-disable timestamp is inferred here. The normal loop/weather
//! profile supplies stereo2 while connected and empty max-channel mono1 otherwise.
use super::*;
impl Engine {
 pub fn live_input_channels(&mut self,layer:usize,channels:usize)->bool{
  if !self.ready||!self.total.live_enabled||layer>=LAYERS||!self.layers[layer].wave.live_created||!matches!(channels,1|2){return self.reject();}
  let state=&mut self.layers[layer];
  if state.channels!=channels{state.filters=[Biquad::default();3];state.channels=channels;}
  true
 }
 pub fn live_input_channel_count(&self,layer:usize)->f64{
  if layer>=LAYERS||!self.ready||!self.total.live_enabled||!self.layers[layer].wave.live_created{f64::NAN}else{self.layers[layer].channels as f64}
 }
}
#[no_mangle]pub extern "C" fn ambience_spatial_live_topology_api()->u32{1}
#[no_mangle]pub extern "C" fn ambience_spatial_live_input_channels(p:&mut Engine,layer:f64,channels:f64)->u32{let(Some(layer),Some(channels))=(integer(layer,5),integer(channels,2))else{return 0;};p.live_input_channels(layer,channels)as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_input_channel_count(p:&Engine,layer:f64)->f64{integer(layer,5).map_or(f64::NAN,|l|p.live_input_channel_count(l))}

impl Engine {
 pub fn live_width_parameters(&mut self,mask:u32)->bool{if !self.ready||!self.total.live_enabled||mask>=64{return self.reject();}self.topology_width_mask=mask;true}
}
#[no_mangle]pub extern "C" fn ambience_spatial_live_width_parameters(p:&mut Engine,mask:u32)->u32{p.live_width_parameters(mask)as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_width_mask(p:&Engine)->u32{p.topology_width_mask}
