// Shown instead of the tour and quests when someone new opens a link with a setup in it (a preview): a few
// prompts for what they are looking at, and a button that starts the tutorial from the beginning.

import React, { useState } from 'react';
import './quests.css';

export default function PreviewGuide({ onStart }) {
    const [open, setOpen] = useState(true);
    if (!open) {
        return (
            <aside className="gen-preview is-folded">
                <button type="button" className="gen-preview-start" onClick={onStart}>Start from the beginning</button>
                <button type="button" className="gen-preview-fold" onClick={() => setOpen(true)} aria-label="Show the preview notes" title="Show the notes">?</button>
            </aside>
        );
    }
    return (
        <aside className="gen-preview" aria-label="Preview">
            <div className="gen-preview-head">
                <strong>You are looking at a shared setup</strong>
                <button type="button" className="gen-preview-fold" onClick={() => setOpen(false)} aria-label="Fold the notes away" title="Fold away">–</button>
            </div>
            <ul>
                <li>Press play to hear it.</li>
                <li>Everything is open, so look around: change a voice, the scale or the background. Nothing is saved unless you copy a link.</li>
            </ul>
            <button type="button" className="gen-preview-start" onClick={onStart}>
                Click me to start from the beginning and learn how to get here
            </button>
        </aside>
    );
}
