#!/bin/sh
# Recalibrates the bow-noise bed of a patch after the model or the default tuning changed (the analyses stay as they are): both takes against the
# rebuilt table, then rebuild. Usage: tools/recalibrateBed.sh Long|Live|Short|Pizzicato  (after tools/addDenseTake.sh has made the merged analysis)
set -e
P=$1; l=$(echo $P | tr A-Z a-z); D="/c/Users/rimuru/Documents/LUNA Sessions/Strings/Exported Files"; R=renders/cello-reference; A=$R/analysis
LEAVE="--leave-out"
N="node --max-old-space-size=6144"
node -e "
const fs=require('fs'),a=JSON.parse(fs.readFileSync('$A/$l.first.json')),b=JSON.parse(fs.readFileSync('$A/$l.dense.json'));
for(const n of [...a.notes,...b.notes]) delete n.bed;
fs.writeFileSync('$A/$l.json',JSON.stringify({...a,notes:[...a.notes,...b.notes]}));"
node tools/buildStringTable.mjs $A/$l.json src/library/stringTables/cello$P.json --name "Cello $P"
$N tools/calibrateBed.mjs src/library/stringTables/cello$P.json "$D/Strings - $P.wav" $R/cello-calibration.timeline.json $A/$l.first.json $l $LEAVE > /dev/null
$N tools/calibrateBed.mjs src/library/stringTables/cello$P.json "$D/Strings - $P-1.wav" $R/cello-dense.timeline.json $A/$l.dense.json $l $LEAVE > /dev/null
node -e "
const fs=require('fs'),a=JSON.parse(fs.readFileSync('$A/$l.first.json')),b=JSON.parse(fs.readFileSync('$A/$l.dense.json'));
fs.writeFileSync('$A/$l.json',JSON.stringify({...a,notes:[...a.notes,...b.notes]}));"
node tools/buildStringTable.mjs $A/$l.json src/library/stringTables/cello$P.json --name "Cello $P"
