import React from 'react';
import { createRoot } from 'react-dom/client';
import '../app/generative.css';
import './presetter.css';
import { applyTheme, storedTheme } from '../app/theme';
import PresetterApp from './PresetterApp';

applyTheme(storedTheme());
createRoot(document.getElementById('root')).render(<PresetterApp />);
