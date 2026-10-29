import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../app/generative.css';
import '../labs.css';
import './levels.css';
import {applyTheme,storedTheme} from '../../app/theme';
import LevelsPage from './LevelsPage';
applyTheme(storedTheme());
createRoot(document.getElementById('root')).render(<LevelsPage/>);
