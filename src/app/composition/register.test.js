import { registerLevel, tameHighRegister } from './register';

test('notes above the comfortable register get softer, bells earlier and further', () => {
    expect(registerLevel(79)).toBe(1); expect(registerLevel(60, true)).toBe(1);
    expect(registerLevel(91)).toBeLessThan(registerLevel(85));
    expect(registerLevel(91, true)).toBeLessThan(registerLevel(91));
    expect(registerLevel(120, true)).toBeGreaterThanOrEqual(0.5);
});

test('only the lead and counter are shaped, by the voice the role plays', () => {
    const events = [{ role: 'lead', midi: 91, velocity: 0.8 }, { role: 'pad', midi: 91, velocity: 0.8 }, { role: 'counter', midi: 91, velocity: 0.8 }];
    tameHighRegister(events, { voices: { lead: { name: 'Bell Lead' }, counter: { name: 'Soft Flute' } } });
    expect(events[1].velocity).toBe(0.8);
    expect(events[0].velocity).toBeLessThan(events[2].velocity);
    expect(events[2].velocity).toBeLessThan(0.8);
});

test('a high bass note plays softer, a pure sine bass most of all, and the low register is untouched', () => {
    const { bassRegisterLevel } = require('./register');
    expect(bassRegisterLevel(40)).toBe(1);
    expect(bassRegisterLevel(53)).toBeLessThan(1);
    expect(bassRegisterLevel(53, true)).toBeLessThan(bassRegisterLevel(53));
    expect(bassRegisterLevel(53, true)).toBeCloseTo(10 ** (-6 * 1.1 / 20));
    const events = [{ role: 'bass', midi: 53, velocity: 0.8 }, { role: 'bass', midi: 36, velocity: 0.8 }];
    tameHighRegister(events, { voices: { bass: { name: 'Sub Bass', preset: { vcoType: 'sine' } } } });
    expect(events[0].velocity).toBeLessThan(0.5); expect(events[1].velocity).toBe(0.8);
});
