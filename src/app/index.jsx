// Mounts the app into index.html's #root.
import React from 'react';
import ReactDOM from 'react-dom/client';
import GenerativeApp from './GenerativeApp';
import FirefoxAndroidNotice from '../audio/FirefoxAndroidNotice';
import './generative.css';
import { applyTheme, storedTheme } from './theme';
import { initialEngine } from './WasmOptions';

applyTheme(storedTheme());

// The Wasm engine is the default: start loading and evaluating it now, rather than once React has mounted and
// the Generator has asked for it (the page's requests come in dependent waves, each a round trip). The
// Generator's own import of it gets this one. A failure here is the Generator's to report, when it asks.
if (initialEngine() === 'wasm') import('./engine/wasmInstrument').catch(() => {});

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <FirefoxAndroidNotice />
        <GenerativeApp />
    </React.StrictMode>
);
