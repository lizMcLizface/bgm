// Progress for several renders at once: one row per job, redrawn in place
// (a terminal) or a line at each tenth (a pipe or log file). Messages are
// printed above the rows, so nothing overwrites anything.

const clock = (seconds) => {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export { clock };

const bar = (fraction, width = 14) => {
    const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width);
    return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
};

export class Board {
    constructor(stream = process.stdout) {
        this.stream = stream;
        this.tty = Boolean(stream.isTTY);
        this.rows = [];
        this.drawn = 0; // lines of rows currently on screen
        this.timer = null;
    }

    /** A row for a job: { audio, video } fractions (null: not part of the job), a status and a label. */
    add(label, { audio = true, video = true } = {}) {
        const row = {
            label, status: 'waiting', started: null, logged: -1,
            audio: audio ? 0 : null, video: video ? 0 : null,
        };
        this.rows.push(row);
        this.schedule();
        return {
            set: (patch) => {
                if (patch.status && patch.status !== row.status && patch.status === 'rendering' && !row.started) row.started = Date.now();
                if (patch.label) row.label = patch.label;
                Object.assign(row, { ...patch, label: row.label });
                this.progress(row);
                this.schedule();
            },
        };
    }

    // Without a terminal: a line when a job's progress passes the next tenth, and on status changes.
    progress(row) {
        if (this.tty) return;
        const fraction = this.fraction(row);
        const tenth = Math.floor(fraction * 10);
        const key = `${row.status}:${tenth}`;
        if (row.logged !== key) {
            row.logged = key;
            this.stream.write(`${this.line(row)}\n`);
        }
    }

    fraction(row) {
        const parts = [row.audio, row.video].filter((x) => x !== null);
        return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
    }

    line(row) {
        const parts = [];
        if (row.audio !== null) parts.push(`audio ${bar(row.audio, 10)} ${String(Math.round(row.audio * 100)).padStart(3)}%`);
        if (row.video !== null) parts.push(`video ${bar(row.video, 10)} ${String(Math.round(row.video * 100)).padStart(3)}%`);
        const fraction = this.fraction(row);
        const elapsed = row.started ? (Date.now() - row.started) / 1000 : 0;
        const left = row.status === 'rendering' && fraction > 0.01 ? clock((elapsed / fraction) * (1 - fraction)) : '--:--:--';
        const time = row.status === 'rendering' ? `  ${clock(elapsed)} (left ${left})` : '';
        return `${row.label.slice(0, 28).padEnd(28)} ${row.status.padEnd(9)} ${row.status === 'waiting' ? '' : parts.join('  ')}${time}`;
    }

    schedule() {
        if (!this.tty || this.timer || this.finished) return;
        this.timer = setTimeout(() => { this.timer = null; this.draw(); }, 250);
    }

    clear() {
        if (this.tty && this.drawn) this.stream.write(`\x1b[${this.drawn}A\x1b[0J`);
        this.drawn = 0;
    }

    draw() {
        if (!this.tty) return;
        this.clear();
        const lines = this.rows.map((row) => this.line(row));
        this.stream.write(`${lines.join('\n')}\n`);
        this.drawn = lines.length;
        if (!this.finished && this.rows.some((row) => row.status === 'rendering')) this.schedule();
    }

    /** A message above the rows. */
    log(text) {
        this.clear();
        this.stream.write(`${text}\n`);
        this.draw();
    }

    finish() {
        this.finished = true;
        clearTimeout(this.timer);
        this.timer = null;
        this.draw();
    }
}
