// Mounts the app into index.html's #root.
import React from 'react';
import ReactDOM from 'react-dom/client';
import GenerativeApp from './GenerativeApp';
import './generative.css';
import { applyTheme, storedTheme } from './theme';

applyTheme(storedTheme());

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <GenerativeApp />
    </React.StrictMode>
);
