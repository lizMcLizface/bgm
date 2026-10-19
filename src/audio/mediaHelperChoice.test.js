import {mediaHelperFromSearch, withMediaHelper} from './mediaHelperChoice';
it('only accepts explicit temporary helper overrides',()=>{
 expect(mediaHelperFromSearch('')).toBeNull();expect(mediaHelperFromSearch('?mediaHelper=0')).toBe(false);expect(mediaHelperFromSearch('?mediaHelper=1')).toBe(true);expect(mediaHelperFromSearch('?mediaHelper=false')).toBeNull();
});
it('keeps the helper test choice with the other URL settings and hash',()=>{
 expect(withMediaHelper('/?preset=rainy-cafe&perf=1#x',false)).toBe('/?preset=rainy-cafe&perf=1&mediaHelper=0#x');expect(withMediaHelper('/?mediaHelper=0',true)).toBe('/?mediaHelper=1');expect(withMediaHelper('/labs/',null)).toBe('/labs/');
});
