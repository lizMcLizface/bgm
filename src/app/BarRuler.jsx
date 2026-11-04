import usePlaybackPosition from './usePlaybackPosition';
import { harmonyLane, barSpans } from './harmonyLaneModel';

/**
 * The current bar's chord(s) and beat numbers on exactly the grid's sixteen columns, directly above
 * the grid (docs/SEQUENCER_DEVICE_PLAN.md). A chord that changes mid-bar splits the block.
 */
export default function BarRuler({ generator, running }) {
    const { pos } = usePlaybackPosition(generator, running, 1);
    if (!generator) return null;
    const beats = generator.beatsPerBar, bar = Math.max(0, Math.floor(pos / beats));
    const spans = barSpans(harmonyLane(generator.getPlan(), beats), bar, beats);
    if (!spans.length) return null;
    const beat = Math.floor(pos % beats), col = (step) => step + 2;
    return (
        <div className="seq-ruler" role="group" aria-label={`Bar ${bar + 1}: chords and beats`}>
            <span className="seq-ruler-bar" style={{ gridRow: 2 }} title="Bar number">{bar + 1}</span>
            {spans.map(({ slot, start, end }) => (
                <span key={start} className={`seq-ruler-chord${slot.unresolved ? ' unresolved' : ''}${slot.split ? ' split' : ''}`} style={{ gridRow: 1, gridColumn: `${col(start)} / ${col(end)}` }}>
                    <b>{slot.numeral}</b> {slot.name}
                </span>
            ))}
            {Array.from({ length: beats }, (_, b) => (
                <span key={b} className={`seq-ruler-beat${running && b === beat ? ' now' : ''}`}
                    style={{ gridRow: 2, gridColumn: `${col(Math.round((b * 16) / beats))} / ${col(Math.round(((b + 1) * 16) / beats))}` }}>{b + 1}</span>
            ))}
        </div>
    );
}
