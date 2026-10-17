import { harmonyMode } from './harmonyScale';

test('automatic parents are conservative and Original keeps the selected scale',()=>{
    expect(harmonyMode('Pentatonic-1')).toBe('Major-1');
    expect(harmonyMode('Pentatonic-5')).toBe('Major-6');
    for(const mode of ['Pentatonic-2','Pentatonic-3','Pentatonic-4','Pentatonic-6','Major-2'])expect(harmonyMode(mode)).toBe(mode);
    expect(harmonyMode('Pentatonic-1','selected')).toBe('Pentatonic-1');
    expect(harmonyMode('Pentatonic-2','major')).toBe('Major-1');
    expect(harmonyMode('Pentatonic-2','minor')).toBe('Major-6');
    for(const choice of ['auto','selected','major','minor'])expect(harmonyMode('Pentatonic-1',choice,'legacy')).toBe('Pentatonic-1');
});
