// Audit commands must also work on checkouts without ignored evidence folders.
import fs from 'node:fs';
fs.mkdirSync('reports/modular_audio', { recursive: true });
