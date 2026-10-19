import {simdFromSearch,withSimd,bankFromSearch,withFMBank} from './simdChoice';
it('requires an explicit temporary FM SIMD choice',()=>{
 expect(simdFromSearch('')).toBeNull();expect(simdFromSearch('?simd=1')).toBe(true);expect(simdFromSearch('?simd=fm')).toBe(true);expect(simdFromSearch('?simd=0')).toBe(false);expect(simdFromSearch('?simd=anything')).toBeNull();
});
it('keeps a source-bank request temporary and retains other query settings',()=>{
 expect(bankFromSearch('?bank=1')).toBe(true);expect(bankFromSearch('?bank=0')).toBe(false);expect(bankFromSearch('')).toBe(false);
 expect(withFMBank('/?preset=tine-and-tide&wasm=1#notes',true)).toBe('/?preset=tine-and-tide&wasm=1&bank=1#notes');expect(withFMBank('/?preset=x',false)).toBe('/?preset=x');
});
it('preserves other settings and fragments while carrying the choice',()=>{
 expect(withSimd('/?preset=tine-and-tide&wasm=1#notes',true)).toBe('/?preset=tine-and-tide&wasm=1&simd=1#notes');
 expect(withSimd('/?simd=1',false)).toBe('/?simd=0');expect(withSimd('/?preset=x',null)).toBe('/?preset=x');
});
