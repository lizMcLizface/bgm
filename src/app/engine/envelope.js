// Envelope planning for notes whose start AND end are known when they are
// scheduled. MonoSynth.noteOn/noteOff drive their stages with setTimeout
// measured from "now" (docs/DESIGN.md §2.1); a sequencer books
// notes ahead of time, so here the whole envelope is computed up front as
// AudioParam automation at times relative to the note's start. Pure - no
// AudioContext - so it is unit-testable and works offline.

import { envelopeShape, minTime } from '../../util/util';

// Piecewise-linear approximation density for shaped (non-linear) stages.
const POINTS_PER_SECOND = 60;
const MIN_SEGMENTS = 4;
const MAX_SEGMENTS = 48;

const levelAt = (stage, fraction) =>
    stage.from + (stage.to - stage.from) * envelopeShape(fraction, stage.shape, stage.exponent);

// Appends `stage`, from its start at `t0` up to `fraction` of it, as
// [time, value] points (the stage's own start point is assumed present).
const sampleStage = (points, stage, t0, fraction = 1) => {
    const span = stage.duration * fraction;
    const segments = stage.shape === 'linear'
        ? 1
        : Math.min(MAX_SEGMENTS, Math.max(MIN_SEGMENTS, Math.ceil(span * POINTS_PER_SECOND)));
    for (let i = 1; i <= segments; i++) {
        const f = (i / segments) * fraction;
        points.push([t0 + stage.duration * f, levelAt(stage, f)]);
    }
};

/**
 * The AHDSR stages a note goes through before its release, mirroring
 * MonoSynth.noteOn's branching: with an attack, 0 -> peak (-> hold) -> sustain;
 * with only a decay, starts at peak and decays; otherwise starts at sustain.
 * Velocity scales levels, never times (unlike PolySynth's getGainEnv).
 *
 * @param {object} env - { attack, hold, holdLevel, decay, sustain, release,
 *   attackShape, decayShape, releaseShape, attackExponent, decayExponent,
 *   releaseExponent }
 * @param {number} velocity - 0..1
 * @returns {{ initial: number, stages: Array<object> }}
 */
export function gainStages(env, velocity = 1) {
    const hasHold = env.hold > 0;
    const peak = (hasHold ? env.holdLevel : 1) * velocity;
    const sustain = env.sustain * velocity;
    const decay = { from: peak, to: sustain, duration: Math.max(env.decay, minTime), shape: env.decayShape, exponent: env.decayExponent };

    if (env.attack > 0) {
        const stages = [{ from: 0, to: peak, duration: Math.max(env.attack, minTime), shape: env.attackShape, exponent: env.attackExponent }];
        if (hasHold) stages.push({ from: peak, to: peak, duration: env.hold, shape: 'linear', exponent: 1 });
        stages.push(decay);
        return { initial: 0, stages };
    }
    if (env.decay > 0) return { initial: peak, stages: [decay] };
    return { initial: sustain, stages: [] };
}

/**
 * Gain automation for a note of known length, truncated where the note's
 * end cuts a stage short so the release starts from the level actually
 * reached (no jump), followed by the release to 0.
 *
 * @param {object} env - see gainStages
 * @param {number} velocity - 0..1
 * @param {number} duration - seconds from note start to release start
 * @returns {{ points: Array<[number, number]>, releaseEnd: number }}
 *   points: [secondsFromStart, value], first is [0, initial];
 *   releaseEnd: seconds from start until the voice is silent again
 */
export function gainEnvelopePoints(env, velocity, duration) {
    const { initial, stages } = gainStages(env, velocity);
    const points = [[0, initial]];
    let t = 0;
    let level = initial;

    for (const stage of stages) {
        if (t + stage.duration <= duration) {
            sampleStage(points, stage, t);
            t += stage.duration;
            level = stage.to;
        } else {
            const fraction = (duration - t) / stage.duration;
            if (fraction > 0) sampleStage(points, stage, t, fraction);
            level = levelAt(stage, Math.max(0, fraction));
            t = duration;
            break;
        }
    }

    // Sustain holds `level` until the note ends.
    if (t < duration) points.push([duration, level]);

    const release = { from: level, to: 0, duration: Math.max(env.release, minTime), shape: env.releaseShape, exponent: env.releaseExponent };
    sampleStage(points, release, duration);
    return { points, releaseEnd: duration + release.duration };
}

/**
 * Release from `level` to 0, for a held (live) note whose end wasn't known
 * when it started. Times are seconds from the release start; the first
 * point is [0, level].
 */
export function releasePoints(env, level) {
    const release = { from: level, to: 0, duration: Math.max(env.release, minTime), shape: env.releaseShape, exponent: env.releaseExponent };
    const points = [[0, level]];
    sampleStage(points, release, 0);
    return points;
}

/**
 * Filter-cutoff envelope as detune events (cents), mirroring MonoSynth's
 * setTargetAtTime-based filter envelope but at scheduled times.
 *
 * @param {object} fenv - { attack, decay, release, amount }
 * @param {number} duration - seconds from note start to release start
 * @returns {Array<object>} { type: 'set' | 'target', time, value, timeConstant }
 */
export function filterEnvelopeEvents(fenv, duration) {
    if (!fenv.amount) return [{ type: 'set', time: 0, value: 0 }];

    const events = [];
    if (fenv.attack) {
        const attack = Math.max(fenv.attack, minTime);
        events.push({ type: 'set', time: 0, value: 0 });
        events.push({ type: 'target', time: 0, value: fenv.amount, timeConstant: attack });
        if (attack < duration) {
            events.push({ type: 'target', time: attack, value: 0, timeConstant: Math.max(fenv.decay, minTime) });
        }
    } else if (fenv.decay) {
        events.push({ type: 'set', time: 0, value: fenv.amount });
        events.push({ type: 'target', time: 0, value: 0, timeConstant: Math.max(fenv.decay, minTime) });
    } else {
        events.push({ type: 'set', time: 0, value: 0 });
    }
    events.push({ type: 'target', time: duration, value: 0, timeConstant: Math.max(fenv.release, minTime) });
    return events;
}

// Cancels automation from `time` on while keeping the value the param has
// at that moment, so cutting a note off mid-ramp doesn't jump. Firefox lacks
// cancelAndHoldAtTime; there a plain cancel is the best available.
export function cancelAndHold(param, time) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(time);
    else param.cancelScheduledValues(time);
}
