import { prepareSound } from './prepareSound';
import { soundFrom } from '../soundGenV3';
vi.mock('./loudness', () => ({ levelPreset: vi.fn(async preset => ({ ...preset, masterVolume: .42 })) }));

test('live/link preparation freezes the resolved kind and context and reuses the same measurement', async () => {
    const info={role:'lead',seed:519,version:3,kind:'any',profile:'folk',bpm:88.4,gate:.53,register:76.1};
    const first=prepareSound(info),second=prepareSound(info);
    expect(first).toBe(second);
    const sound=await first;
    expect(sound.info).toEqual({role:'lead',seed:519,version:3,kind:sound.kind,profile:'folk',bpm:88,gate:.55,register:76});
    expect(sound.info.kind).not.toBe('any');
    expect(sound.preset.masterVolume).toBe(.42);
    expect(info.kind).toBe('any');
});

test('mode changes rebuild a v3 recipe while keeping the same saved sound definition', async () => {
    const info={role:'bass',ensemble:7321,version:3,profile:'chip',bpm:176,gate:.2,register:40};
    const latest=await prepareSound(info,'latest'),original=await prepareSound(info,'legacy');
    expect(original.info).toEqual(latest.info);
    expect(original.preset).toEqual({...soundFrom(info,'legacy').preset,masterVolume:.42});
    expect(original.preset).not.toEqual(latest.preset);
});
