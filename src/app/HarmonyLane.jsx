import { STAGE_NAMES } from './sequencer';
import usePlaybackPosition from './usePlaybackPosition';
import { harmonyLane, laneWindow, barOfSlot } from './harmonyLaneModel';

const BARS = 8;

/**
 * The planned harmony above the sequencer grid: chord blocks across the next bars, bar numbers and beat
 * ticks beneath, and the sequencer stage each bar will play. Display only (docs/SEQUENCER_DEVICE_PLAN.md).
 * The generator is read each frame while it runs; the component re-renders when the beat changes or the plan does.
 */
export default function HarmonyLane({ generator, running }) {
    const { pos } = usePlaybackPosition(generator, running, 1);
    if (!generator) return null;

    const beats = generator.beatsPerBar, fromBar = Math.max(0, Math.floor(pos / beats));
    const slots = harmonyLane(generator.getPlan(), beats), shown = laneWindow(slots, fromBar, BARS, beats);
    if (!shown.length) return null;
    const first = fromBar * beats, span = BARS * beats, beat = Math.floor(pos);
    const left = (b) => `${((b - first) / span) * 100}%`, width = (a, b) => `${((b - a) / span) * 100}%`;
    return (
        <div className="seq-harmony" role="group" aria-label="Chords planned for the coming bars">
            <div className="seq-harmony-chords">
                {shown.map((s) => {
                    const count = barOfSlot(s, Math.max(pos, s.from), beats), now = pos >= s.startBeat && pos < s.endBeat;
                    const stages = s.bars.map((b) => b.stage).filter((v) => v !== null);
                    return (
                        <span key={`${s.startBeat}-${s.split ? 's' : 'c'}`} className={`seq-chord${now ? ' now' : ''}${s.unresolved ? ' unresolved' : ''}${s.split ? ' split' : ''}`}
                            style={{ left: left(s.from), width: width(s.from, s.to) }}
                            title={`${s.name} (${s.numeral})${stages.length ? `, stage ${[...new Set(stages)].map((i) => STAGE_NAMES[i]).join(', ')}` : ''}`}>
                            <b>{s.numeral}</b> {s.name}
                            {count && count.of > 1 && <small>{` ${count.index}/${count.of}`}</small>}
                            {stages.length > 0 && <small className="seq-chord-stage">{STAGE_NAMES[stages[0]]}</small>}
                        </span>
                    );
                })}
            </div>
            <div className="seq-harmony-beats" aria-hidden="true">
                {Array.from({ length: span }, (_, i) => {
                    const b = first + i;
                    return <span key={b} className={`${i % beats === 0 ? 'bar' : ''}${b === beat ? ' now' : ''}`} style={{ width: `${100 / span}%` }}>{i % beats === 0 ? Math.floor(b / beats) + 1 : ''}</span>;
                })}
            </div>
        </div>
    );
}
