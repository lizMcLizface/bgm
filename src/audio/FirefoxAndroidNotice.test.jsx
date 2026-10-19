import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FirefoxAndroidNotice from './FirefoxAndroidNotice';
import {FIREFOX_ANDROID_NOTICE_KEY as key} from './firefoxAndroidCompatibility';
let host,root,ua,show,close;
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 ua=vi.spyOn(navigator,'userAgent','get').mockReturnValue('Mozilla/5.0 (Android 17; Mobile) Gecko/158.0 Firefox/158.0');
 show=HTMLDialogElement.prototype.showModal;close=HTMLDialogElement.prototype.close;
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
});
afterEach(()=>{act(()=>root.unmount());host.remove();ua.mockRestore();HTMLDialogElement.prototype.showModal=show;HTMLDialogElement.prototype.close=close;delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
it('remains open through StrictMode effects and continues without disabling the underlying page',()=>{
 act(()=>root.render(<React.StrictMode><FirefoxAndroidNotice/><button id="play">Play</button></React.StrictMode>));
 expect(host.querySelector('dialog').open).toBe(true);expect(host.querySelector('dialog').getAttribute('aria-describedby')).toBe('audio-browser-notice-body');
 act(()=>host.querySelector('dialog button').click());expect(host.querySelector('dialog')).toBeNull();expect(host.querySelector('#play').disabled).toBe(false);expect(sessionStorage.getItem(key)).toBe('1');expect(localStorage.getItem(key)).toBeNull();
});
it('remembers the explicit opt-out and supports Escape dismissal',()=>{
 act(()=>root.render(<FirefoxAndroidNotice/>));act(()=>host.querySelector('input').click());act(()=>host.querySelector('dialog').dispatchEvent(new Event('cancel',{bubbles:true,cancelable:true})));expect(host.querySelector('dialog')).toBeNull();expect(localStorage.getItem(key)).toBe('1');
});
it('does not interrupt desktop Firefox or Chrome Android',()=>{
 ua.mockReturnValue('Mozilla/5.0 (Windows NT 10.0) Firefox/158.0');act(()=>root.render(<FirefoxAndroidNotice/>));expect(host.querySelector('dialog')).toBeNull();
});
