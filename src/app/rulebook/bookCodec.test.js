import {encodeBook,decodeBook,BOOK_RULE_IDS,BOOK_GROUP_IDS} from './bookCodec';
import {cleanBook,readBook,withBook,inheritBook,withPresetBook,baseSettings,applyBook} from './session';
import {RULES} from './model';
import {GROUPS,groupValue} from './groups';
import {defaultSettings} from '../settings';
import {sceneBySlug} from '../scenes';

test('wire IDs cover the current catalog and retain their fixed first-link encoding',()=>{
 expect(new Set(BOOK_RULE_IDS).size).toBe(BOOK_RULE_IDS.length);expect(new Set(BOOK_GROUP_IDS).size).toBe(BOOK_GROUP_IDS.length);
 for(const rule of RULES)expect(BOOK_RULE_IDS).toContain(rule.id);for(const group of GROUPS)expect(BOOK_GROUP_IDS).toContain(group.id);
 expect(encodeBook({rules:{music:{enabled:true}}})).toBe('b1.AQEAAAA');
 expect(cleanBook(decodeBook('b1.AQEAAAA'))).toEqual({rules:{music:{enabled:true}},baseline:{}});
});
test('permissions, numeric and enum values, inherited flags, groups and reset baselines round-trip',()=>{
 const settings=defaultSettings(),rules=Object.fromEntries(RULES.map((r,i)=>[r.id,{enabled:!!(i%2),...(r.parameter?{value:r.parameter.max}:r.options?{value:r.options.at(-1)}:{})}]));
 const groups=Object.fromEntries(GROUPS.map(g=>[g.id,groupValue(settings,g.path)]));
 const book=cleanBook({version:1,rules,baseline:rules,inherited:rules,groups,groupBaseline:groups}),code=encodeBook(book);
 expect(cleanBook(decodeBook(code))).toEqual(book);expect(readBook('?book='+code)).toEqual(book);
 expect(code.length).toBeLessThan(encodeURIComponent(JSON.stringify(book)).length/2);
 const gen={settings,replan(){},setMany(p){Object.assign(this.settings,p);}};applyBook(gen,book);expect(baseSettings(gen.settings,readBook('?book='+code))).toEqual(baseSettings(gen.settings,book));
});
test('unchanged preset permissions disappear, while edited flags and standalone shared setups retain them',()=>{
 const scene=sceneBySlug('altman'),book=inheritBook(scene.rulebook),url='/?preset=altman';
 expect(withBook(url,book,scene.rulebook)).toBe(url);
 const edited={...book,rules:{'held-bass-glides':{enabled:false}}},path=withBook(url,edited,scene.rulebook);
 expect(path.length).toBeLessThan(50);expect(path).toContain('book=b1.');
 const restored=withPresetBook(scene.rulebook,readBook(new URL(path,'http://localhost').search));expect(restored.rules).toEqual(edited.rules);expect(restored.inherited).toEqual(book.inherited);
 const standalone=withBook('/?m=M',book);expect(readBook(new URL(standalone,'http://localhost').search).inherited).toEqual(book.inherited);
 const changed={...book,inherited:{...book.inherited,'held-bass-glides':{enabled:false}}};
 expect(withPresetBook(scene.rulebook,readBook(new URL(withBook(url,changed,scene.rulebook),'http://localhost').search)).inherited['held-bass-glides'].enabled).toBe(false);
});
test('legacy JSON links migrate and malformed, truncated and unsupported encodings fail closed',()=>{
 const old={version:1,rules:{'human-timing':{enabled:true,value:23}},baseline:{'human-timing':{enabled:true,value:12}},inherited:{'held-bass-glides':{enabled:true}}};
 const loaded=readBook('?book='+encodeURIComponent(JSON.stringify(old))),path=withBook('/?m=M',loaded);
 expect(path).toContain('book=b1.');expect(readBook(new URL(path,'http://localhost').search)).toEqual(cleanBook(old));
 for(const text of ['b2.AQEAAAA','b1.A','b1.AA','b1.AQEAAA','b1.AQEAAAAA','b1.!!!!','b1.'+'A'.repeat(12001),'{}','null'])expect(readBook('?book='+encodeURIComponent(text))).toEqual({rules:{},baseline:{}});
 const valid=encodeBook(cleanBook(old));for(let n=3;n<valid.length;n++)expect(readBook('?book='+valid.slice(0,n))).toEqual({rules:{},baseline:{}});
});
