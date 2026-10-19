import {FIREFOX_ANDROID_NOTICE_KEY as key,isFirefoxAndroid,shouldShowFirefoxAndroidNotice,dismissFirefoxAndroidNotice} from './firefoxAndroidCompatibility';
const firefoxAndroid='Mozilla/5.0 (Android 17; Mobile; rv:158.0) Gecko/158.0 Firefox/158.0';
beforeEach(()=>{localStorage.clear();sessionStorage.clear();});
it('warns Firefox Android phones and tablets, but not other browsers or desktop Firefox',()=>{
 expect(isFirefoxAndroid(firefoxAndroid)).toBe(true);expect(isFirefoxAndroid('Mozilla/5.0 (Android 14; Tablet) Gecko/158.0 Firefox/158.0')).toBe(true);
 for(const ua of ['', 'Mozilla/5.0 (Windows NT 10.0) Gecko/158.0 Firefox/158.0', 'Mozilla/5.0 (Android 17) Chrome/155.0 Mobile Safari/537.36', 'Mozilla/5.0 (iPhone) FxiOS/158.0'])expect(isFirefoxAndroid(ua)).toBe(false);
});
it('normally dismisses for this session across the main page and labs',()=>{
 expect(shouldShowFirefoxAndroidNotice(firefoxAndroid)).toBe(true);dismissFirefoxAndroidNotice();expect(shouldShowFirefoxAndroidNotice(firefoxAndroid)).toBe(false);expect(localStorage.getItem(key)).toBeNull();sessionStorage.clear();expect(shouldShowFirefoxAndroidNotice(firefoxAndroid)).toBe(true);
});
it('only saves a persistent opt-out when explicitly chosen',()=>{
 dismissFirefoxAndroidNotice(true);sessionStorage.clear();expect(shouldShowFirefoxAndroidNotice(firefoxAndroid)).toBe(false);expect(localStorage.getItem(key)).toBe('1');
});
it('storage restrictions cannot prevent the popup from being shown or dismissed',()=>{
 const get=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked');}),set=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked');});
 try{expect(shouldShowFirefoxAndroidNotice(firefoxAndroid)).toBe(true);expect(()=>dismissFirefoxAndroidNotice(true)).not.toThrow();}finally{get.mockRestore();set.mockRestore();}
});
