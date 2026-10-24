import fs from 'node:fs';
import path from 'node:path';

// Analysis recordings remain local. Do not import them with Vite asset URLs.
export function localRainReferences(isPublic) {
    const root = path.resolve('rain_synth/bands');
    const allowed = name => /^(rain|tin)_band[0-9]_(ref|synth)\.wav$/.test(name);
    const serve = (req, res, next) => {
        const pathname = req.url.split('?')[0];
        if (!pathname.startsWith('/local-rain/')) return next();
        if (pathname === '/local-rain/index.json') {
            const files = fs.existsSync(root) ? fs.readdirSync(root).filter(allowed) : [];
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ files })); return;
        }
        const name = pathname.slice('/local-rain/bands/'.length);
        if (!pathname.startsWith('/local-rain/bands/') || !allowed(name)) { res.statusCode = 404; res.end(); return; }
        const file = path.join(root, name);
        if (!fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Type', 'audio/wav'); res.setHeader('Content-Length', fs.statSync(file).size);
        fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    };
    return { name: 'local-rain-references', apply: () => !isPublic,
        configureServer(server) { server.middlewares.use(serve); },
        configurePreviewServer(server) { server.middlewares.use(serve); } };
}
