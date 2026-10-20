import React,{lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import './synths.css';
import FirefoxAndroidNotice from '../audio/FirefoxAndroidNotice';

const PAGES={cs80:lazy(()=>import('./cs80/Cs80Page')),juno:lazy(()=>import('./juno/JunoPage'))};
const Home=lazy(()=>import('./SynthsHome'));
/** /synths/ → hub; /synths/<id>/ → that synth. Unknown ids fall back to the hub. */
export function synthRoute(path){const parts=path.split('/').filter(Boolean);return parts[0]==='synths'&&PAGES[parts[1]]?parts[1]:null;}
const Page=PAGES[synthRoute(location.pathname)]??Home;
createRoot(document.getElementById('root')).render(<><FirefoxAndroidNotice/><Suspense fallback={<div className="synth loading">Warming up…</div>}><Page/></Suspense></>);
