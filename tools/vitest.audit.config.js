// Vitest config for the offline composition audit (npm run audit:composition). The audit
// files end in .audit.js so the normal suite (npm test) does not run them.
import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../vite.config.js';

export default defineConfig((env) => mergeConfig(base(env), {
    test: { setupFiles: ['tools/auditSetup.js'], include: ['tools/**/*.audit.js'], exclude: ['.tmp/**', 'node_modules/**'], testTimeout: 600000 },
}));
