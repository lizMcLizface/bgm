import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import VoiceBrowser from './VoiceBrowser';

// The voice's sound: a button with its name that opens the voice browser
// (VoiceBrowser.jsx). The window is only built while it is open, so a page
// with several of these costs nothing until one is used. Uncontrolled by
// default; with `open` / `onOpenChange` the page can open it from elsewhere
// (the track strip's boxes). `role` lists that role's own kind of sound first.
const PresetPicker = ({ value, edited, onChange, id, role, open: controlled, onOpenChange }) => {
    const [own, setOwn] = useState(false);
    const open = controlled === undefined ? own : controlled;
    const trigger = useRef(null);
    const setOpen = (next) => {
        if (controlled === undefined) setOwn(next);
        if (onOpenChange) onOpenChange(next);
        if (!next && trigger.current) trigger.current.focus({ preventScroll: true });
    };
    return (
        <>
            <button ref={trigger} id={id} type="button" className="gen-voice-button" aria-haspopup="dialog" aria-expanded={open}
                onClick={() => setOpen(!open)} title="Choose a sound">
                <span>{value}{edited ? ' (edited)' : ''}</span>
                <span aria-hidden="true">▾</span>
            </button>
            {open && createPortal(
                <VoiceBrowser value={value} edited={edited} onChange={onChange} onClose={() => setOpen(false)} role={role} />,
                // inside the page's own root (its theme and styles), and out of the field's <label>
                (trigger.current && trigger.current.closest('.gen')) || document.body,
            )}
        </>
    );
};

export default PresetPicker;
