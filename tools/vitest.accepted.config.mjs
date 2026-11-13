import { execFileSync } from 'node:child_process';
import factory from '../vite.config.js';

// Deliberately opt-in: frozen untracked implementation WIP is not accepted coverage.
// npm test continues to discover all tests, including that unfinished work.
const include = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0').filter(file => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file));
export default environment => {
    const config = factory(environment);
    return { ...config, test: { ...config.test, include } };
};
