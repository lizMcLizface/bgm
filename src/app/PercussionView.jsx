import usePlaybackPosition from './usePlaybackPosition';
import { DRUM_LABELS } from './percussion';
import { percussionRows } from './percussionRows';

const SHORT = { kick: 'KD', brush: 'BR', shaker: 'SH', rim: 'RM', hat: 'HH', swish: 'SW', tom: 'TM', clap: 'CP', ride: 'RD', crash: 'CR', bell: 'BL', snare: 'SD', punch: 'PK', sizzle: 'BH' };

/**
 * What the drums are playing in the current bar, whatever makes them (a drum style, a beat, the
 * sequencer): the planned percussion events as a read-only step grid. Display only.
 */
export default function PercussionView({ generator, running }) {
    const { pos } = usePlaybackPosition(generator, running, 4);
    if (!generator) return null;

    const beats = generator.beatsPerBar, bar = Math.max(0, Math.floor(pos / beats));
    const planned = generator.getPlan().find((p) => p.bar === bar);
    const { rows, exact } = percussionRows(planned, beats);
    const lit = running ? Math.floor(((pos % beats) / beats) * 16) % 16 : -1;
    return (
        <div className="seq-grid seq-readonly" role="group" aria-label={`Drums in bar ${bar + 1}`}>
            {rows.length === 0 && <small>{planned ? 'No drums in this bar.' : 'Nothing planned yet: press play.'}</small>}
            {rows.map(({ drum, cells }) => (
                <div className="seq-row" key={drum}>
                    <span className="seq-name" title={DRUM_LABELS[drum]}>{SHORT[drum]}</span>
                    {cells.map((v, step) => (
                        <span key={step} className={`seq-cell${v > 0 ? ' on' : ''}${v > 0 && v < 0.35 ? ' soft' : ''}${step % 4 === 0 ? ' beat' : ''}${step === lit ? ' play' : ''}`} />
                    ))}
                </div>
            ))}
            {rows.length > 0 && !exact && <small>Some hits fall between steps (swing, flams, ornaments) and are drawn on the nearest one.</small>}
        </div>
    );
}
