// Light / dark / follow-the-system theme: a data-theme attribute on <html>
// that generative.css keys its colours on; 'auto' removes it, leaving the
// prefers-color-scheme media query in charge. Stored per browser.

const KEY = 'bgm-theme';
export const THEMES = ['auto', 'light', 'dark'];

export function storedTheme() {
    try {
        const theme = window.localStorage.getItem(KEY);
        return THEMES.includes(theme) ? theme : 'auto';
    } catch (e) {
        return 'auto';
    }
}

export function applyTheme(theme) {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
        window.localStorage.setItem(KEY, theme);
    } catch (e) {
        // not stored; still applied for this visit
    }
}
