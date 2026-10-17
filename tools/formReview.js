import { SCENES, sceneSlug } from '../src/app/scenes';
import { previewEnsemble, renderEnsemble, matchAverageLevels, drawNotes } from './ensembleReview';

export const formOptions = options => ({ ...options, variant: 'latest', coordinate: true, sections: true,
    sectionMode: options.mode, sectionPhrases: options.phrases, bass: 'preset', pad: 'preset', straight: false, activeLead: false });
export const inspectForm = options => previewEnsemble(formOptions(options));

const form = document.querySelector('#form-review');
const roles = ['lead', 'counter', 'pad', 'bass', 'perc'];
const urls = [];
function display(plan, title, options) {
    const section = document.createElement('section'), heading = document.createElement('h2');
    heading.textContent = title; section.append(heading);
    const timeline = document.createElement('div'); timeline.className = 'sections';
    const entries = [];
    for (const b of plan.bars) {
        const s = b.section;
        if (!s) continue;
        if (entries.at(-1)?.start === s.start) entries.at(-1).end = b.bar + 1;
        else entries.push({ ...s, end: b.bar + 1, first: b.bar });
    }
    for (const s of entries) {
        const span = document.createElement('span'); span.className = s.type;
        span.style.width = `${(s.end - s.first) / options.bars * 100}%`;
        span.textContent = `${s.type} ${s.first + 1}–${s.end}`;
        span.title = `${s.type}, bars ${s.first + 1}–${s.end}${s.nextType ? `; prepares ${s.nextType}` : ''}`;
        timeline.append(span);
    }
    section.append(timeline);
    const description = document.createElement('p');
    description.textContent = `${entries.length} sections · ${(plan.seconds / 60).toFixed(1)} minutes${plan.gain === undefined ? '' : ` · level adjustment ${(20 * Math.log10(plan.gain || 1)).toFixed(1)} dB`}`;
    section.append(description);
    if (plan.blob) {
        const url = URL.createObjectURL(plan.blob); urls.push(url);
        const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'metadata'; audio.src = url;
        audio.addEventListener('play', () => {
            const other = [...document.querySelectorAll('audio')].find(a => a !== audio && !a.paused);
            if (other) { audio.currentTime = Math.min(other.currentTime, Number.isFinite(audio.duration) ? audio.duration : Infinity); other.pause(); }
        });
        const link = document.createElement('a'); link.href = url; link.download = `form-${options.preset}-${plan.developForm ? 'developed' : 'previous'}-${options.seed}.wav`; link.textContent = 'Save WAV';
        section.append(audio, link);
    }
    // Four phrases per row keep note patterns legible on long plans.
    for (let offset = 0; offset < plan.bars.length; offset += 16) {
        const bars = plan.bars.slice(offset, offset + 16), start = bars[0].start;
        const seconds = bars.at(-1).start + bars.at(-1).seconds - start;
        const canvas = document.createElement('canvas');
        canvas.setAttribute('aria-label', `Notes in bars ${offset + 1}–${offset + bars.length}`);
        drawNotes(canvas, { bars: bars.map(b => ({ ...b, start: b.start - start })), seconds }, options.parts);
        section.append(canvas);
    }
    const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Phrase decisions';
    const table = document.createElement('table');
    const row = cells => { const tr = document.createElement('tr'); for (const text of cells) { const td = document.createElement('td'); td.textContent = text; tr.append(td); } return tr; };
    table.append(row(['Bar', 'Section', 'Theme / role', 'Preparation']));
    for (const b of plan.bars.filter(b => b.bar % 4 === 0)) table.append(row([b.bar + 1, b.section?.type ?? 'off', b.phrase ? `${b.phrase.themeId + 1} / ${b.phrase.role}` : '—', b.section?.transition ? `${b.section.transition} → ${b.section.nextType}` : '—']));
    details.append(summary, table); section.append(details);
    return section;
}

if (form) {
    for (const scene of SCENES.filter(s => s.settings.playMusic !== false)) form.elements.preset.add(new Option(scene.name, sceneSlug(scene.name)));
    const defaults = { preset: 'rainy-cafe', seed: '42', bars: '64', mode: 'gentle', phrases: '2' };
    const query = new URLSearchParams(location.search);
    for (const [key, fallback] of Object.entries(defaults)) {
        form.elements[key].value = query.get(key) || fallback;
        if (!form.elements[key].value) form.elements[key].value = key === 'preset' ? form.elements[key].options[0].value : fallback;
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const options = { preset: form.elements.preset.value, seed: Math.max(0, Math.min(2147483647, Math.floor(Number(form.elements.seed.value) || 0))),
            bars: Number(form.elements.bars.value), mode: form.elements.mode.value, phrases: Number(form.elements.phrases.value),
            parts: roles.filter(role => form.elements[`hear-${role}`].checked) };
        const status = document.querySelector('#status'), buttons = [...form.querySelectorAll('button')];
        if (!options.parts.length) { status.textContent = 'Choose at least one voice.'; return; }
        history.replaceState(null, '', location.pathname + '?' + new URLSearchParams(Object.fromEntries(Object.keys(defaults).map(k => [k, options[k]]))));
        buttons.forEach(b => b.disabled = true); document.querySelectorAll('audio').forEach(a => a.pause());
        try {
            const render = event.submitter?.value === 'render', plans = [];
            for (const developForm of [false, true]) {
                const title = developForm ? 'Developed form' : 'Previous sections';
                status.textContent = `${render ? 'Rendering' : 'Inspecting'} ${title}…`;
                const p = formOptions({ ...options, developForm });
                const plan = render ? await renderEnsemble(p, n => { status.textContent = `Rendering ${title} ${Math.round(n * 100)}%`; }) : previewEnsemble(p);
                plans.push({ ...plan, developForm });
            }
            const matched = render ? await matchAverageLevels(plans, form.elements.match.checked) : plans;
            urls.splice(0).forEach(url => URL.revokeObjectURL(url));
            document.querySelector('#results').replaceChildren(...matched.map((plan, i) => display(plan, i ? 'Developed form' : 'Previous sections', options)));
            status.textContent = `Ready: ${options.bars} bars per version, seed ${options.seed}.${render ? ' Switching players keeps the listening position.' : ' Render audio to hear this pair.'}`;
        } catch (error) { status.textContent = error.message; }
        finally { buttons.forEach(b => b.disabled = false); }
    });
}
