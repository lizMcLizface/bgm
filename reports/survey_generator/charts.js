export const chartColors = ['#60a5fa', '#fbbf24', '#a78bfa', '#34d399', '#fb7185', '#f97316', '#22d3ee', '#c084fc', '#a3e635', '#f472b6', '#e2e8f0', '#94a3b8'];

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n = value => Number(value).toLocaleString('en-US');
const entries = object => Object.entries(object).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const dataTable = object => `<details class="chart-details"><summary>Exact values</summary><table><thead><tr><th>Value</th><th>Count</th></tr></thead><tbody>${entries(object).map(([key, count]) => `<tr><td>${escapeHtml(key)}</td><td>${n(count)}</td></tr>`).join('')}</tbody></table></details>`;

/** Split is normalized to the sum of its mutually exclusive values. */
export function splitChart(title, object, description = '') {
    const values = entries(object), total = values.reduce((sum, [, count]) => sum + count, 0);
    if (!total) return `<div class="chart"><h4>${escapeHtml(title)}</h4><p>No observations.</p></div>`;
    const summary = values.map(([key, count]) => `${key}: ${n(count)} (${(count * 100 / total).toFixed(1)}%)`).join('; ');
    return `<figure class="chart split-chart"><figcaption><strong>${escapeHtml(title)}</strong><span>${n(total)} total</span></figcaption>${description ? `<p>${escapeHtml(description)}</p>` : ''}
        <div class="split-track" role="img" aria-label="${escapeHtml(`${title}: ${summary}`)}">${values.map(([key, count], i) => `<span style="width:${count * 100 / total}%;background:${chartColors[i % chartColors.length]}" title="${escapeHtml(`${key}: ${n(count)}`)}"></span>`).join('')}</div>
        <div class="chart-legend">${values.map(([key, count], i) => `<span><i style="background:${chartColors[i % chartColors.length]}"></i>${escapeHtml(key)} <b>${n(count)}</b> <small>${(count * 100 / total).toFixed(1)}%</small></span>`).join('')}</div></figure>`;
}

/** Multiple independently normalized rows, with consistent colors across rows. */
export function stackedRows(title, rows, description = '') {
    const keys = [...new Set(rows.flatMap(([, values]) => Object.keys(values)))];
    return `<figure class="chart stacked-chart"><figcaption><strong>${escapeHtml(title)}</strong></figcaption>${description ? `<p>${escapeHtml(description)}</p>` : ''}
        <div class="chart-legend">${keys.map((key, i) => `<span><i style="background:${chartColors[i % chartColors.length]}"></i>${escapeHtml(key)}</span>`).join('')}</div>
        ${rows.map(([label, values]) => {
            const total = Object.values(values).reduce((sum, count) => sum + count, 0);
            const text = keys.map(key => `${key}: ${n(values[key] ?? 0)} (${total ? (100 * (values[key] ?? 0) / total).toFixed(1) : '0.0'}%)`).join('; ');
            return `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar" role="img" aria-label="${escapeHtml(`${label}: ${text}`)}">${keys.map((key, i) => `<span style="width:${total ? 100 * (values[key] ?? 0) / total : 0}%;background:${chartColors[i % chartColors.length]}" title="${escapeHtml(`${key}: ${n(values[key] ?? 0)}`)}"></span>`).join('')}</div><span class="number">${n(total)}</span></div>`;
        }).join('')}</figure>`;
}

/** Independent, possibly overlapping counts on a common absolute scale. */
export function countBars(title, object, description = '') {
    const values = entries(object), maximum = Math.max(0, ...values.map(([, count]) => count));
    return `<figure class="chart count-chart"><figcaption><strong>${escapeHtml(title)}</strong></figcaption>${description ? `<p>${escapeHtml(description)}</p>` : ''}
        ${values.map(([label, count]) => `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar" role="img" aria-label="${escapeHtml(`${label}: ${n(count)}`)}"><span style="width:${maximum ? count * 100 / maximum : 0}%;background:${chartColors[0]}"></span></div><span class="number">${n(count)}</span></div>`).join('')}</figure>`;
}

/** Counts and phi for binary rule pairs. Null phi means a constant input. */
export function binaryCorrelation(a, b) {
    if (a.length !== b.length || !a.length) throw new Error('Correlation requires equal, nonempty samples');
    let bothOn = 0, bothOff = 0, onOff = 0, offOn = 0;
    for (let i = 0; i < a.length; i++) {
        if (typeof a[i] !== 'boolean' || typeof b[i] !== 'boolean') throw new Error('Correlation values must be boolean');
        if (a[i] && b[i]) bothOn++;
        else if (!a[i] && !b[i]) bothOff++;
        else if (a[i]) onOff++;
        else offOn++;
    }
    const denominator = Math.sqrt((bothOn + onOff) * (bothOff + offOn) * (bothOn + offOn) * (bothOff + onOff));
    return { bothOn, bothOff, onOff, offOn, phi: denominator ? (bothOn * bothOff - onOff * offOn) / denominator : null };
}

/** Rulebook's Off status means disabled; all other statuses retain an enabled choice. */
export function ruleBinaryValues(rule, presets) {
    const members = new Map();
    for (const { status, names } of ruleDistribution(rule).members) for (const name of names) {
        if (members.has(name)) throw new Error(`Duplicate preset ${name} for ${rule.id}`);
        members.set(name, status !== 'Off');
    }
    return presets.map(preset => {
        if (!members.has(preset.name)) throw new Error(`Missing preset ${preset.name} for ${rule.id}`);
        return members.get(preset.name);
    });
}

export function correlationMatrix(rules, presets) {
    if (!rules.length || !presets.length) return '<p>No rules or presets in this selection.</p>';
    const values = rules.map(rule => ruleBinaryValues(rule, presets));
    return `<div class="matrix-scroll"><table class="matrix"><thead><tr><th scope="col">Rule</th>${rules.map((rule, i) => `<th scope="col" title="${escapeHtml(rule.title)}">${i + 1}</th>`).join('')}</tr></thead><tbody>${rules.map((rule, i) => `<tr><th scope="row">${i + 1}. ${escapeHtml(rule.title)}</th>${rules.map((other, j) => {
        const c = binaryCorrelation(values[i], values[j]), agreement = c.bothOn + c.bothOff;
        const label = c.phi === null ? (c.bothOn === presets.length ? 'ON' : c.bothOff === presets.length ? 'OFF'
            : agreement === 0 ? '≠' : '–') : c.phi.toFixed(2);
        const intensity = c.phi === null ? 0 : Math.abs(c.phi);
        const color = c.phi === null ? '#374151' : c.phi >= 0 ? `rgba(59,130,246,${0.15 + intensity * .7})` : `rgba(244,114,182,${0.15 + intensity * .7})`;
        const text = `${rule.title} / ${other.title}: ${c.phi === null ? 'phi undefined (constant rule)' : `phi ${c.phi.toFixed(3)}`}; both on ${c.bothOn}, both off ${c.bothOff}, row on / column off ${c.onOff}, row off / column on ${c.offOn}; n=${presets.length}`;
        return `<td tabindex="0" style="background:${color}" title="${escapeHtml(text)}" aria-label="${escapeHtml(text)}">${label}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** Each dot represents an exact value; height is its count, not a histogram bin. */
export function scatterChart(title, object, description = '') {
    const values = Object.entries(object).map(([label, count]) => ({ label, value: Number(label.replace(/%$/, '')), count }))
        .sort((a, b) => a.value - b.value);
    if (!values.length) return `<div class="chart"><h4>${escapeHtml(title)}</h4><p>No observations.</p></div>`;
    if (values.some(item => !Number.isFinite(item.value))) throw new Error(`Non-numeric value in ${title}`);
    const min = values[0].value, max = values.at(-1).value, maxCount = Math.max(...values.map(item => item.count));
    const x = value => max === min ? 300 : 45 + (value - min) / (max - min) * 510;
    const y = count => 120 - count / maxCount * 90;
    const summary = values.map(({ label, count }) => `${label}: ${n(count)}`).join('; ');
    return `<figure class="chart scatter-chart"><figcaption><strong>${escapeHtml(title)}</strong><span>${n(values.reduce((sum, item) => sum + item.count, 0))} total</span></figcaption>${description ? `<p>${escapeHtml(description)}</p>` : ''}
        <svg viewBox="0 0 600 150" role="img" aria-label="${escapeHtml(`${title}; horizontal axis value, vertical axis count. ${summary}`)}">
        <line x1="45" y1="120" x2="555" y2="120" class="axis"/><line x1="45" y1="25" x2="45" y2="120" class="axis"/>
        <text x="40" y="30" text-anchor="end">${n(maxCount)}</text><text x="40" y="123" text-anchor="end">0</text>
        <text x="45" y="140" text-anchor="middle">${escapeHtml(min)}</text><text x="555" y="140" text-anchor="middle">${escapeHtml(max)}</text>
        ${values.map(item => `<circle cx="${x(item.value)}" cy="${y(item.count)}" r="4.5"><title>${escapeHtml(`${item.label}: ${n(item.count)}`)}</title></circle>`).join('')}</svg>
        <div class="chart-hint">Value → · Count ↑ · Each dot is an exact value</div>${dataTable(object)}</figure>`;
}

export function numericDistribution(object) {
    const keys = Object.keys(object);
    return keys.length > 0 && keys.every(key => /^-?\d+(?:\.\d+)?%?$/.test(key));
}

/** Counts and names for one preset category (or the entire catalog). */
export function ruleDistribution(rule, selectedCategory = 'all') {
    const values = {}, statuses = {}, onOff = { On: 0, Off: 0 }, members = [];
    for (const [category, groups] of Object.entries(rule.categories)) {
        if (selectedCategory !== 'all' && selectedCategory !== category) continue;
        for (const [key, names] of Object.entries(groups)) {
            const separator = key.indexOf(' | ');
            if (separator < 0) throw new Error(`Invalid rule distribution for ${rule.id}`);
            const status = key.slice(0, separator), value = key.slice(separator + 3);
            statuses[status] = (statuses[status] ?? 0) + names.length;
            if (status !== 'Off') values[value] = (values[value] ?? 0) + names.length;
            onOff[status === 'Off' ? 'Off' : 'On'] += names.length;
            members.push({ category, status, value, names });
        }
    }
    return { values, statuses, onOff, members };
}
