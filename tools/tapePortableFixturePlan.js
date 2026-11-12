/** Review-only caller plan, not automatic Native tail scheduling. */
export function portableTapeRetirementPlan(rate){
 if(!Number.isInteger(rate)||rate<8000||rate>192000)throw Error('Invalid Tape fixture rate');
 // A declared 50ms caller budget, checked against the actual policy at all review rates.
 // Never infer a Native hidden-task retirement epoch from this conservative plan.
 const retireFrame=Math.max(4096,Math.ceil(rate*.05/128)*128);
 const activateFrame=Math.max(8192,retireFrame+4096);
 return Object.freeze({sourceStopFrame:1024,retireFrame,activateFrame,renderEndFrame:activateFrame+4096,expectedLfoFrames:retireFrame+4096});
}
