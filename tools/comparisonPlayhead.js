export function playbackPosition(plan, time) {
    if (time < 0) return { fraction: 0, label: 'Before bar ' + (plan.bars[0].bar+1), bar: null };
    if (time >= plan.seconds) return { fraction: 1, label: 'Tail · after bar ' + (plan.bars.at(-1).bar + 1), bar: null };
    const b = plan.bars.find(b => time >= b.start && time < b.start + b.seconds) ?? plan.bars[0];
    const beat = Math.floor((time - b.start) / b.seconds * b.units / (b.unitsPerBeat ?? 1)) + 1;
    return { fraction: time / plan.seconds, label: `Bar ${b.bar + 1} · beat ${beat}`, bar: b.bar + 1 };
}

/** One media clock drives both charts, including paused seeks and A/B switches. */
export function comparisonPlayheads() {
    const items = [], listeners = []; let active, frame = 0;
    const listen = (element, event, callback) => { element.addEventListener(event, callback); listeners.push(() => element.removeEventListener(event, callback)); };
    const update = (audio, offset) => {
        const musicTime = audio.currentTime - offset;
        for (const item of items) {
            const position = playbackPosition(item.plan, musicTime-item.start);
            item.line.style.left = ((item.left + position.fraction * (item.canvas.width - item.left - item.right)) / item.canvas.width * 100) + '%';
            item.line.hidden = position.bar === null;
            item.caption.textContent = position.label;
            item.caption.dataset.bar = position.bar ?? '';
        }
    };
    const tick = () => { frame = 0; if (!active) return; update(active.audio, active.offset); if (!active.audio.paused) frame = requestAnimationFrame(tick); };
    return {
        add(audio, canvas, plan, { offset = 0, left = 75, right = 10, start = 0 } = {}) {
            const wrapper = document.createElement('div'), line = document.createElement('div'), caption = document.createElement('p');
            wrapper.style.cssText = 'position:relative;margin:14px 0';
            canvas.replaceWith(wrapper); wrapper.append(canvas, line); canvas.style.margin = '0';
            line.className = 'comparison-cursor'; line.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;background:#fff;box-shadow:0 0 4px #000;pointer-events:none';
            caption.className = 'comparison-position'; caption.style.fontVariantNumeric = 'tabular-nums'; wrapper.after(caption);
            const item = { audio, canvas, plan, offset, left, right, start, line, caption }; items.push(item);
            canvas.style.cursor = 'pointer';
            listen(canvas, 'click', event => {
                const rect = canvas.getBoundingClientRect(), pixel = (event.clientX - rect.left) / rect.width * canvas.width;
                const target = active && !active.audio.paused ? active : item;
                target.audio.currentTime = target.offset + start + Math.max(0, Math.min(1, (pixel - left) / (canvas.width - left - right))) * plan.seconds;
                active = target; update(target.audio, target.offset);
            });
            listen(audio, 'play', () => {
                if (active && active.audio !== audio && !active.audio.paused) {
                    audio.currentTime = Math.max(0, active.audio.currentTime - active.offset + offset);
                    active.audio.pause();
                }
                active = item; cancelAnimationFrame(frame); tick();
            });
            for (const event of ['seeked', 'timeupdate', 'pause', 'ended']) listen(audio, event, () => {
                if (!active || active.audio === audio || active.audio.paused) { active = item; update(audio, offset); }
            });
            update(active?.audio ?? audio, active?.offset ?? offset);
        },
        dispose() { cancelAnimationFrame(frame); listeners.forEach(remove => remove()); items.length = 0; active = null; }
    };
}
