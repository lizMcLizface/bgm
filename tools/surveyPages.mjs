// Survey sources are maintained tools; generated evidence stays in ignored reports/.
import fs from 'node:fs';
import path from 'node:path';
export function surveyPages() {
    return {
        name: 'survey-page-paths',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const [pathname] = req.url.split('?');
                const source = pathname.replace(/^\/reports\/(survey_generator|survey_chords)(?=\/|$)/, '/tools/$1');
                if (source !== pathname && fs.existsSync(path.resolve('.' + source))) req.url = req.url.replace(pathname, source);
                next();
            });
        },
        generateBundle: {
            order: 'post',
            handler(options, bundle) {
                for (const family of ['survey_generator', 'survey_chords']) {
                    const source = 'tools/' + family + '/index.html', target = 'reports/' + family + '/index.html';
                    if (bundle[source]) { bundle[source].fileName = target; bundle[target] = bundle[source]; delete bundle[source]; }
                }
            },
        },
    };
}
