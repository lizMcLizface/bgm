// @vitest-environment node
import {it,expect} from 'vitest';
import {previewSettings} from './previewSettings';
it('keeps fresh defaults and validates saved device controls without accepting runtime state',()=>{
 const defaults=previewSettings(null);expect(defaults).toMatchObject({mode:'serial',blocks:6,scope:'selected',material:'captured-score',roles:[],comparisonOrder:'six-first'});
 expect(previewSettings({version:99,mode:'worker',blocks:12})).toEqual(defaults);
 expect(previewSettings({version:1,mode:'bad',blocks:999,scope:'bad',material:'bad',roles:['lead','lead','unknown','perc'],playing:true,report:{}})).toEqual({...defaults,roles:['lead','perc']});
 expect(previewSettings({version:1,mode:'worker',blocks:12,scope:'pitched-set',material:'voice-audition',roles:['bass','lead'],comparisonOrder:'twelve-first'})).toMatchObject({mode:'worker',blocks:12,scope:'pitched-set',material:'voice-audition',roles:['lead','bass'],comparisonOrder:'twelve-first'});
});
