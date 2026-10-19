export const FIREFOX_ANDROID_NOTICE_KEY = 'bgm-firefox-android-notice-v1';
export const isFirefoxAndroid = (ua = '') => /\bAndroid\b/i.test(ua) && /\bFirefox\//i.test(ua);

export function shouldShowFirefoxAndroidNotice(ua = globalThis.navigator?.userAgent ?? '') {
    if (!isFirefoxAndroid(ua)) return false;
    try { if (localStorage.getItem(FIREFOX_ANDROID_NOTICE_KEY) === '1') return false; } catch { /* optional storage */ }
    try { if (sessionStorage.getItem(FIREFOX_ANDROID_NOTICE_KEY) === '1') return false; } catch { /* optional storage */ }
    return true;
}

export function dismissFirefoxAndroidNotice(permanent = false) {
    try { sessionStorage.setItem(FIREFOX_ANDROID_NOTICE_KEY, '1'); } catch { /* dismissal still closes the popup */ }
    if (permanent) {
        try { localStorage.setItem(FIREFOX_ANDROID_NOTICE_KEY, '1'); } catch { /* optional storage */ }
    }
}
