#!/bin/sh
# Folds the dense take (makeStringDenseMidi.mjs) into a patch's table: analyse it, merge with the first take's analysis, calibrate the bow-noise
# bed for both takes against the merged table, rebuild. Usage: tools/addDenseTake.sh Long|Live|Short|Pizzicato   (WAVs "Strings - X.wav" and "Strings - X-1.wav")
set -e
P=$1; l=$(echo $P | tr A-Z a-z); D="/c/Users/rimuru/Documents/LUNA Sessions/Strings/Exported Files"; R=renders/cello-reference; A=$R/analysis
T1=$R/cello-calibration.timeline.json; T2=$R/cello-dense.timeline.json; MODE=sustain; LEAVE=""
if [ "$l" = short ] || [ "$l" = pizzicato ]; then MODE=decay; LEAVE="--leave-out"; fi
N="node --max-old-space-size=6144"
[ -f $A/$l.first.json ] || cp $A/$l.json $A/$l.first.json
$N tools/analyzeStringTake.mjs "$D/Strings - $P-1.wav" $T2 $A/$l.dense.json --mode $MODE > $A/$l.dense.log
node -e "
const fs=require('fs'),a=JSON.parse(fs.readFileSync('$A/$l.first.json')),b=JSON.parse(fs.readFileSync('$A/$l.dense.json'));
for(const n of a.notes) delete n.bed; for(const n of b.notes) delete n.bed;
fs.writeFileSync('$A/$l.json',JSON.stringify({...a,notes:[...a.notes,...b.notes]}));"
node tools/buildStringTable.mjs $A/$l.json src/library/stringTables/cello$P.json --name "Cello $P"
$N tools/calibrateBed.mjs src/library/stringTables/cello$P.json "$D/Strings - $P.wav" $T1 $A/$l.first.json $l $LEAVE > /dev/null
$N tools/calibrateBed.mjs src/library/stringTables/cello$P.json "$D/Strings - $P-1.wav" $T2 $A/$l.dense.json $l $LEAVE > /dev/null
node -e "
const fs=require('fs'),a=JSON.parse(fs.readFileSync('$A/$l.first.json')),b=JSON.parse(fs.readFileSync('$A/$l.dense.json'));
fs.writeFileSync('$A/$l.json',JSON.stringify({...a,notes:[...a.notes,...b.notes]}));"
node tools/buildStringTable.mjs $A/$l.json src/library/stringTables/cello$P.json --name "Cello $P"
