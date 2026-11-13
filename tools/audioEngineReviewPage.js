// Browser Reload starts the cold constructor prelude outside a page gesture.
// Starting oscillators after page-button navigation can auto-resume Web Audio.
if (new URL(location.href).searchParams.get('backend') === 'integrated') {
    document.querySelector('#backend').value = 'integrated';
    document.querySelector('#backend').disabled = true;
    document.querySelector('#status').textContent = 'Preparing the selected backend at suspended frame zero';
    import('./audioEngineReview.js').catch(error => {
        document.querySelector('#status').textContent = 'Could not load integrated review: ' + String(error);
    });
} else {
    document.querySelector('#backend').addEventListener('change', event => {
        document.querySelector('#prepare').disabled = event.target.value !== 'integrated';
    });
    document.querySelector('#prepare').addEventListener('click', () => {
        const url = new URL(location.href);
        url.searchParams.set('backend', 'integrated');
        history.replaceState(null, '', url);
        document.querySelector('#prepare').disabled = true;
        document.querySelector('#backend').disabled = true;
        document.querySelector('#status').textContent = 'Backend selected. Use browser Reload (Ctrl+R) once to prepare it, then run either batch.';
        document.querySelector('#reload').disabled = true;
    });
}
