import React,{lazy} from 'react';
import {createRoot} from 'react-dom/client';
import './synths.css';
import './devices.css';
import './desk.css';
import FirefoxAndroidNotice from '../audio/FirefoxAndroidNotice';
import PageStartup from './PageStartup';

const PAGES={cs80:lazy(()=>import('./cs80/Cs80Page')),juno:lazy(()=>import('./juno/JunoPage')),prophet5:lazy(()=>import('./prophet/ProphetPage')),jupiter8:lazy(()=>import('./jupiter/JupiterPage')),minimoog:lazy(()=>import('./minimoog/MinimoogPage')),dx7:lazy(()=>import('./dx7/Dx7Page')),obxa:lazy(()=>import('./obxa/ObxaPage')),vs:lazy(()=>import('./vs/VsPage')),wt:lazy(()=>import('./wt/WtPage')),tr808:lazy(()=>import('./drums/DrumPage').then(m=>({default:m.Tr808Page}))),tr909:lazy(()=>import('./drums/DrumPage').then(m=>({default:m.Tr909Page}))),tr606:lazy(()=>import('./drums/DrumPage').then(m=>({default:m.Tr606Page}))),tr707:lazy(()=>import('./drums/DrumPage').then(m=>({default:m.Tr707Page}))),tb303:lazy(()=>import('./tb303/Tb303Page'))};
const Home=lazy(()=>import('./SynthsHome'));
PAGES.effects=lazy(()=>import('./effects/EffectsPage'));
PAGES.ensemble=lazy(()=>import('./ensemble/EnsemblePage'));
PAGES.all=lazy(()=>import('./all/AllPage'));
PAGES.poly=lazy(()=>import('./diy/DiyPage').then(m=>({default:m.PolyPage})));
PAGES.piano=lazy(()=>import('./piano/PianoPage'));
PAGES.strings=lazy(()=>import('./strings/StringsPage'));
PAGES.iowa=lazy(()=>import('./iowa/IowaPage'));
PAGES.fm=lazy(()=>import('./diy/DiyPage').then(m=>({default:m.FMPage})));
/** /synths/ → hub; /synths/<id>/ → that synth. Unknown ids fall back to the hub. */
export function synthRoute(path){const parts=path.split('/').filter(Boolean);return parts[0]==='synths'&&PAGES[parts[1]]?parts[1]:null;}
const Page=PAGES[synthRoute(location.pathname)]??Home;
createRoot(document.getElementById('root')).render(<><FirefoxAndroidNotice/><PageStartup><Page/></PageStartup></>);
