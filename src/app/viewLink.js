// ?view=landscape (or ?view=fluid) opens the page with that background and the interface
// half hidden: only the transport and the timeline show. The parameter stays in the address,
// so a bookmark or a screen-saver link keeps opening that way; it does not change saved preferences.
const VIEWS = { landscape: 'scenery', fluid: 'fluid' };

export const viewFromSearch = (search = '') => {
    const view = new URLSearchParams(search).get('view');
    return VIEWS[view] ? { view, backdrop: VIEWS[view] } : null;
};

export const withView = (path, linked) => {
    if (!linked) return path;
    const [base, hash = ''] = path.split('#');
    return `${base}${base.includes('?') ? '&' : '?'}view=${linked.view}${hash ? `#${hash}` : ''}`;
};
