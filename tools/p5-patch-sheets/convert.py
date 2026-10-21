import json,sys
# Usage: python convert.py <sheets-raw.json> <patch-sheets.json>
# Knob angles and button states (pipeline.py) plus the oscillator pitches printed under each drawing
# → panel values in sysex.js decodeProgram's shape. Knobs use the printed 0–10 scale (300 degrees from
# 7 to 5 o'clock), rounded to 0.05.
raw=json.load(open(sys.argv[1]))['pages']

# "OSC A / OSC B" lines, read by eye: octaves up from the lowest knob position plus an interval,
# 'LF' for low-frequency mode. Two octaves up is 8' (0 semitones).
def up(octaves,plus=0):return (octaves-2)*12+plus
LF='LF'
PITCH={
 '11':(up(1),up(2)),'12':(up(1),up(1)),'13':(up(1),up(1)),'14':(up(1,7),up(2)),'15':(up(3),LF),'16':(up(2),up(3)),'17':(up(1,3),up(1)),'18':(up(3,7),up(1)),
 '21':(up(2),up(1)),'22':(up(2),up(2)),'23':(up(2),up(2)),'24':(up(3),up(3)),'25':(up(2),LF),'26':(up(2),up(2)),'27':(up(3,4),up(2)),'28':(up(1),up(1,7)),
 '31':(up(3),up(3)),'32':(up(1),up(1)),'33':(up(2),up(2)),'34':(up(3),up(3)),'35':(up(1),up(2)),'36':(up(2),up(2)),'37':(up(4),up(1)),'38':(up(3),up(3)),
 '41':(up(2),LF),'42':(up(2),up(2)),'43':(up(2),up(1,7)),'44':(up(2),LF),'45':(up(2),up(0)),'46':(up(1),LF),'47':(up(1),LF),'48':(up(2,6),up(2,-1)),
 '51':(up(0),up(5)),'52':(up(0),LF),'53':(up(1),up(1)),'54':(up(1),LF),'55':(up(0),up(1,4)),'56':(up(0),up(2)),
}

knob=lambda deg:round(min(1,max(0,(deg+150)/300))*20)/20
patches=[]
for p in raw:
  k,b=p['knobs'],p['buttons'];a,bp=PITCH[p['code']];low=bp==LF
  v={
   'oscAFreq':a,'oscBFreq':0 if low else bp,'oscBLowFreq':low,'oscBFreqRaw':round(knob(k['bFreq'])*120),
   'oscBFineCents':round(knob(k['bFine'])*102),
   'oscASaw':b['aSaw'],'oscAPulse':b['aPulse'],'oscBSaw':b['bSaw'],'oscBTri':b['bTri'],'oscBPulse':b['bPulse'],
   'oscAPw':knob(k['aPw']),'oscBPw':knob(k['bPw']),'sync':b['sync'],'oscBKeyboard':b['bKybd'],
   'glide':knob(k['glide']),'mixA':knob(k['mixA']),'mixB':knob(k['mixB']),'noise':knob(k['mixNoise']),
   'cutoff':knob(k['cutoff']),'resonance':knob(k['res']),'keyTrack':'full' if b['kbdTrack'] else 'off','filterEnv':knob(k['fEnv']),
   'lfoRate':knob(k['lfoRate']),'lfoInitial':0,'lfoSaw':b['lfoSaw'],'lfoTri':b['lfoTri'],'lfoSquare':b['lfoSquare'],
   'wheelMix':knob(k['wheelMix']),'wheelFreqA':b['wmFreqA'],'wheelFreqB':b['wmFreqB'],'wheelPwA':b['wmPwA'],'wheelPwB':b['wmPwB'],'wheelFilter':b['wmFilter'],
   'polyModEnv':knob(k['pmEnv']),'polyModOscB':knob(k['pmOscB']),'polyModFreqA':b['pmFreqA'],'polyModPwA':b['pmPwA'],'polyModFilter':b['pmFilter'],
   'filterAttack':knob(k['fAttack']),'filterDecay':knob(k['fDecay']),'filterSustain':knob(k['fSustain']),'filterRelease':knob(k['fRelease']),
   'ampAttack':knob(k['aAttack']),'ampDecay':knob(k['aDecay']),'ampSustain':knob(k['aSustain']),'ampRelease':knob(k['aRelease']),
   'release':b['release'],'unison':b['unison'],
  }
  patches.append({'code':p['code'],'page':p['page'],'values':v})
json.dump({'schema':1,'source':'Prophet-5 patch sheets, measured from the drawings (tools/p5-patch-sheets)',
 'accuracy':'knobs ±0.05 on a 0–1 scale; oscillator pitch from the printed notes','patches':patches},open(sys.argv[2],'w'),indent=1)
print(len(patches),'patches')
