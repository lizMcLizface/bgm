import {percussionFromSearch,withPercussion} from './percussionChoice';
it('uses the current native kit until explicitly opted in',()=>{
    expect(percussionFromSearch('')).toBe('native');
    expect(percussionFromSearch('?perc=wasm')).toBe('wasm');
    expect(percussionFromSearch('?perc=808')).toBe('808');
    expect(percussionFromSearch('?perc=unknown')).toBe('native');
});
it('preserves sharing parameters and hashes, and removes the override for native',()=>{
    expect(withPercussion('/?wasm=1&perf=1#x','808')).toBe('/?wasm=1&perf=1&perc=808#x');
    expect(withPercussion('/?perc=808&wasm=1','native')).toBe('/?wasm=1');
    expect(withPercussion('/?perc=wasm','native')).toBe('/');
});
