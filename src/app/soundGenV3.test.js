import { soundFrom, soundContext, soundProfile, SOUND_PROFILES, normalizeSoundContext } from './soundGenV3';
import { generateSoundV2, generateEnsembleSoundV2, soundFrom as oldSound } from './soundGenV2';
import { SCENES } from './scenes';
import { defaultSettings, encodeSettings, decodeShare } from './settings';
import PRESET_DEFAULTS from './engine/presetDefaults';
import { sanitizePreset } from './editor/presetStore';

test('v3 families are deterministic, finite, valid and bounded for every role', () => {
    for (const profile of SOUND_PROFILES) for (const role of ['pad','bass','lead','counter']) for (let seed=1;seed<=16;seed++) {
        const info={version:3,role,ensemble:seed*197,profile,bpm:seed%2?60:176,gate:seed%2?.2:2.5,register:role==='bass'?36:84};
        const sound=soundFrom(info);
        expect(sound).toEqual(soundFrom(info));
        expect(sanitizePreset(sound.preset)).toEqual(sound.preset);
        for (const [key,value] of Object.entries(sound.preset)) {
            expect(typeof value).toBe(typeof PRESET_DEFAULTS[key]);
            if(typeof value==='number')expect(Number.isFinite(value)).toBe(true);
        }
        expect(sound.preset.masterFilterType).toBe('highpass');
        expect(sound.preset.masterFilterFreq).toBe(20);
        expect(sound.preset.gainAttack).toBeLessThanOrEqual(info.gate*.3);
        expect(sound.preset.gainRelease).toBeLessThanOrEqual(role==='bass'?.25:role==='pad'?2:.8);
        if(role==='bass'){expect(sound.preset.stereoSpread).toBe(0);expect(sound.preset.reverbAmount).toBeLessThan(.05);}
    }
});

test('old recipes stay frozen and Original maps new sounds to their baseline recipe', () => {
    for(const info of [{role:'lead',seed:12345},{role:'bass',ensemble:77},{role:'pad',seed:777,kind:'keys',version:2}])expect(soundFrom(info)).toEqual(oldSound(info));
    const single={role:'lead',seed:42,kind:'pluck',version:3,profile:'folk',bpm:88,gate:.5,register:76};
    expect(soundFrom(single,'legacy').preset).toEqual(generateSoundV2('lead',42,'pluck').preset);
    const ensemble={...single,seed:undefined,ensemble:42};
    expect(soundFrom(ensemble,'legacy').preset).toEqual(generateEnsembleSoundV2('lead',42).preset);
    expect(soundFrom(single).preset).not.toEqual(soundFrom(single,'legacy').preset);
});

test('context controls articulation, register and tempo without mutating settings', () => {
    const slow={...defaultSettings(),bpm:60,leadDensity:0},fast={...slow,bpm:180,leadDensity:1};
    const a=soundContext(slow,null,'lead'),b=soundContext(fast,null,'lead');
    expect(b.gate).toBeLessThan(a.gate);
    const info={role:'lead',seed:42,kind:'lead',version:3,profile:'analogue'};
    const long=soundFrom({...info,...a}),short=soundFrom({...info,...b});
    expect(short.preset.gainRelease).toBeLessThan(long.preset.gainRelease);
    expect(short.preset.delayTime).toBeCloseTo(.25,3);
    const high=soundFrom({...info,...a,register:96});
    expect(high.preset.filterFreq).toBeLessThan(long.preset.filterFreq);
    expect(slow.bpm).toBe(60);
});

test('key evaluation presets choose appropriate families', () => {
    const expected={'Fireside folk':'folk','Turnip Town':'folk','Rainy café':'keys','Chapel organ':'organ','Deep night':'ambient','Boss Fight, Politely':'cinematic','Replicant Blues':'cinematic','Oxygen Debt':'analogue'};
    for(const [name,profile] of Object.entries(expected))expect(soundProfile(SCENES.find(s=>s.name===name))).toBe(profile);
});

test('v3 single and ensemble links retain frozen context alongside older sounds', () => {
    const presets={lead:{generated:{role:'lead',seed:0xabcdef,kind:'pluck',version:3,profile:'folk',bpm:88,gate:.55,register:76}},
        pad:{generated:{role:'pad',ensemble:0x123456,version:3,profile:'ambient',bpm:72,gate:3.2,register:64}},
        bass:{generated:{role:'bass',ensemble:123,version:2}},counter:{generated:{role:'counter',seed:42}}};
    const settings={...defaultSettings(),seed:9},back=decodeShare(encodeSettings(settings,presets));
    expect(back.presets).toEqual(presets);
    expect(soundFrom(back.presets.lead.generated)).toEqual(soundFrom(presets.lead.generated));
    expect(normalizeSoundContext({profile:'bad',bpm:NaN,gate:Infinity,register:999})).toEqual({profile:'neutral',bpm:30,gate:.05,register:127});
});
