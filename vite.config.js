import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from liz.moe/bgm/ (GitHub Pages project site), so every asset and
// worklet URL is prefixed with /bgm/ (import.meta.env.BASE_URL).
export default defineConfig({
    base: '/bgm/',
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
    },
});
