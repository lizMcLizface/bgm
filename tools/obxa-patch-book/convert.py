# Turns panels.json (measured knobs/LEDs per panel) + titles.txt (printed names and pitch notes)
# into the OB-Xa factory set as JSON and YAML.
import json,sys
P=json.load(open('panels.json'))
# titles.txt: one line per panel in book order, code|name|VCO1 note|VCO2 note (read from the scan by eye)
# Usage: python convert.py <out.json> [titles.txt]
T=[l.rstrip('\n').split('|') for l in open(sys.argv[2] if len(sys.argv)>2 else 'titles.txt',encoding='utf-8') if l.strip()]
assert len(P)==len(T)==96
PERFORMANCE={'volume','balance','master_tune','mod_rate','mod_depth'}   # front-panel controls the OB-Xa does not store
def on(L,k):return L[k]>0.5
out=[]
for p,(code,name,vco1,vco2) in zip(P,T):
  L=p['leds'];K={k:(None if k in p['weak_pointer'] else v) for k,v in p['knobs'].items()}
  led_code=''.join(c.upper() for c in 'abcd' if on(L,'group_'+c))+''.join(str(i) for i in range(1,9) if on(L,f'program_{i}'))
  osc2=('full' if on(L,'mix_osc2_full') else 'half' if on(L,'mix_osc2_half') else 'off')
  out.append({
   'code':code,'name':name,'page':p['page'],'position':'top' if p['half']=='a' else 'bottom',
   **({'drawing_note':f'programmer LEDs drawn as {led_code}'} if led_code!=code else {}),
   'pitch':{'osc1':vco1,'osc2':vco2},
   'oscillators':{'osc1_freq':K['osc1_freq'],'osc2_freq':K['osc2_freq'],'pulse_width':K['osc_pw'],'osc2_detune':K['osc2_detune'],
     'osc1_waves':[w for w in ('saw','pulse') if on(L,'osc1_'+w)],'osc2_waves':[w for w in ('saw','pulse') if on(L,'osc2_'+w)],
     'sync':on(L,'sync'),'filter_env_to_osc2':on(L,'osc2_filter_env')},
   'mixer':{'osc1':on(L,'mix_osc1'),'osc2':osc2,'noise':on(L,'mix_noise')},
   'filter':{'cutoff':K['filter_freq'],'resonance':K['resonance'],'env_amount':K['filter_env_amount'],'four_pole':on(L,'four_pole'),'key_track':on(L,'track')},
   'filter_envelope':{k:K['filter_'+k] for k in ('attack','decay','sustain','release')},
   'amp_envelope':{k:K['amp_'+k] for k in ('attack','decay','sustain','release')},
   'lfo':{'rate':K['lfo_rate'],'waves':[w for w,k in (('sine','lfo_sine'),('square','lfo_square'),('sample & hold','lfo_sh')) if on(L,k)],
     'freq_depth':K['freq_mod_depth'],'freq_to':[d for d,k in (('osc1','freq_mod_osc1'),('osc2','freq_mod_osc2'),('filter','freq_mod_filter')) if on(L,k)],
     'pw_depth':K['pw_mod_depth'],'pw_to':[d for d,k in (('osc1','pw_mod_osc1'),('osc2','pw_mod_osc2')) if on(L,k)]},
   'control':{'portamento':K['portamento'],'unison':on(L,'unison'),'auto':on(L,'auto'),'hold':on(L,'hold'),'chord':on(L,'chord')},
   'keyboard':[k for k in ('split','double','lower','upper') if on(L,k)],
   'performance':{'volume':K['volume'],'balance':K['balance'],'master_tune':K['master_tune'],
     'wheel_rate':K['mod_rate'],'wheel_depth':K['mod_depth'],'wheel_to':[d for d in ('lower','upper') if on(L,'wheel_'+d)],
     'wheel_mod':[d for d in ('osc1','osc2') if on(L,'mod_'+d)],'bend':[d for d,k in (('osc2 only','bend_osc2_only'),('narrow','bend_narrow')) if on(L,k)],
     'transpose':[d for d in ('down','up') if on(L,'transpose_'+d)]},
  })
json.dump({'source':'Oberheim OB-Xa/120 "Programmed Patches" book (facsimile panels), measured from the scan','knob_scale':'0-10, 12 o\'clock = 5; null = no pointer drawn','patches':out},open(sys.argv[1],'w'),indent=1)
print(len(out),[o['code']+'≠'+o['drawing_note'] for o in out if 'drawing_note' in o])
