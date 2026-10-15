import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served at the root of calmbgm.com (GitHub Pages with a custom domain:
// public/CNAME). Asset and worklet URLs still go through
// import.meta.env.BASE_URL, so a sub-path deploy only needs `base` changed.
export default defineConfig({
    base: '/',
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
    },
});
