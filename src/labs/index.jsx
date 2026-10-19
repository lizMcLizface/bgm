import React from 'react';
import {createRoot} from 'react-dom/client';
import '../app/generative.css';
import './labs.css';
import {applyTheme,storedTheme} from '../app/theme';
import LabRouter from './LabRouter';
import FirefoxAndroidNotice from '../audio/FirefoxAndroidNotice';
applyTheme(storedTheme());
createRoot(document.getElementById('root')).render(<><FirefoxAndroidNotice/><LabRouter/></>);
