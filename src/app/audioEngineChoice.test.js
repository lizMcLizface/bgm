import {engineFromSearch,withAudioEngine} from './audioEngineChoice';
import {presetFromSearch} from './scenes';
import {shareUrl,defaultSettings} from './settings';
test('debugging links explicitly select either engine and leave unknown values alone',()=>{
 expect(engineFromSearch('?wasm=1')).toBe('wasm');expect(engineFromSearch('?wasm=0')).toBe('legacy');expect(engineFromSearch('')).toBeNull();expect(engineFromSearch('?wasm=banana')).toBeNull();
 expect(presetFromSearch('?rainy-cafe&wasm=1')).toBe('rainy-cafe');
});
test('the override survives both preset links and encoded share links',()=>{
 expect(withAudioEngine('/?preset=rainy-cafe#notes','wasm')).toBe('/?preset=rainy-cafe&wasm=1#notes');expect(withAudioEngine('/?wasm=1','legacy')).toBe('/?wasm=0');
 const url=shareUrl(defaultSettings(),{}, {origin:'https://calmbgm.com',pathname:'/',search:'?wasm=1'});expect(new URL(url).searchParams.get('wasm')).toBe('1');
 expect(withAudioEngine('/?preset=x',null)).toBe('/?preset=x');
});
