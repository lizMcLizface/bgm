// Downloads the few VSCO 2 Community Edition folders that /synths/iowa plays into the git-ignored banks/vsco. CC0: https://github.com/sgossner/VSCO-2-CE
// Only derived tables ship, the same as the Iowa recordings.
//   node tools/fetchVsco.mjs     needs the gh CLI, which lists the repository's files
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PATCHES } from '../src/app/engine/iowaModel/patches.js';

const REPO = 'sgossner/VSCO-2-CE', ROOT = 'banks/vsco', RAW = `https://raw.githubusercontent.com/${REPO}/HEAD/`;
const folders = [...new Set(PATCHES.filter((p) => p.source === 'vsco').map((p) => p.folder))];
const listing = execFileSync('gh', ['api', `repos/${REPO}/git/trees/HEAD?recursive=1`, '--jq', '.tree[]|select(.type=="blob")|.path'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const files = listing.split('\n').filter((path) => /\.wav$/i.test(path) && folders.some((folder) => path.startsWith(folder + '/')));
console.log(`${files.length} files from ${folders.length} folders`);

async function pool(items, size, job) {
    const queue = [...items];
    await Promise.all(Array.from({ length: size }, async () => { while (queue.length) await job(queue.shift()); }));
}
let failed = 0;
await pool(files, 4, async (path) => {
    const target = join(ROOT, path);
    if (existsSync(target)) return;
    try {
        const response = await fetch(RAW + path.split('/').map(encodeURIComponent).join('/'));
        if (!response.ok) throw new Error(response.status);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    } catch (error) { failed++; console.error(`failed ${path}: ${error.message}`); }
});
console.log(`${files.length - failed} of ${files.length} files in ${ROOT}`);
