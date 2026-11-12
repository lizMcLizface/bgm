import{MainStripLiveRust}from'./mainStripLiveRust.js';
export const MAIN_STRIP_RANGE_PROFILE='main-tone-volume-duck-raw-frequency-v1';
/** Compatible Main ABI with an explicit raw-frequency profile tag. */
export class MainStripRangeRust extends MainStripLiveRust{
 constructor(module,configuration){if(!(module instanceof WebAssembly.Module)||!WebAssembly.Module.exports(module).some(e=>e.kind==='function'&&e.name==='main_strip_range_api'))throw Error('Explicit Main raw-frequency module required');super(module,configuration);if(this.e.main_strip_range_api()!==1){this.dispose();throw Error('Main raw-frequency ABI differs');}}
}
