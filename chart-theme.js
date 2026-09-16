// Night Grid chart theme for Plotly.
// app.js builds every chart layout with light-mode defaults (white paper, #eee grids,
// black load lines). Rather than editing 11 newPlot sites, this wraps the Plotly entry
// points and rewrites those light-mode colours to the dark palette used by styles.css.
// Must load AFTER plotly.js and BEFORE app.js.
(function () {
    if (typeof window.Plotly === 'undefined') return;

    const T = {
        paper: '#161B22',
        plot: '#161B22',
        grid: '#262D37',
        zero: '#3A424D',
        text: '#C9D1D9',
        muted: '#7D8590',
        line: '#E6EDF3',      // replaces black load lines
        base: '#34D399',      // replaces the plain 'green' base-size dash
        font: "'Noto Sans Thai', 'Chakra Petch', 'Segoe UI', system-ui, sans-serif"
    };

    // Layout-level colour keys whose light values get remapped.
    const LAYOUT_COLOR_MAP = {
        '#eee': T.grid, '#eeeeee': T.grid, '#ddd': T.grid, '#e0e0e0': T.grid,
        '#888': T.zero, '#888888': T.zero,
        '#fafafa': T.plot, '#f8f9fa': T.plot, 'white': T.paper, '#fff': T.paper, '#ffffff': T.paper,
        '#444': T.text, '#333': T.text, '#222': T.text, '#000': T.text, 'black': T.text,
        '#666': T.muted, '#777': T.muted, '#999': T.muted
    };
    const LAYOUT_COLOR_KEYS = new Set(['gridcolor', 'zerolinecolor', 'linecolor', 'paper_bgcolor', 'plot_bgcolor', 'tickcolor']);

    // Trace colours that disappear on a dark background.
    const TRACE_COLOR_MAP = {
        'black': T.line, '#000': T.line, '#000000': T.line, '#111': T.line, '#222': T.line,
        '#2c3e50': '#B8C4D0', 'green': T.base
    };

    const lower = v => (typeof v === 'string' ? v.trim().toLowerCase() : v);

    function walkLayout(node, parentKey) {
        if (Array.isArray(node)) return node.map(n => walkLayout(n, parentKey));
        if (!node || typeof node !== 'object') return node;
        const out = {};
        for (const key of Object.keys(node)) {
            let v = node[key];
            const leaf = key.split('.').pop(); // relayout uses dotted keys ('xaxis.gridcolor')
            if (typeof v === 'string') {
                if (LAYOUT_COLOR_KEYS.has(leaf) && LAYOUT_COLOR_MAP[lower(v)]) {
                    v = LAYOUT_COLOR_MAP[lower(v)];
                } else if (key === 'color' && (parentKey === 'font' || parentKey === 'titlefont' || parentKey === 'tickfont') && LAYOUT_COLOR_MAP[lower(v)]) {
                    v = LAYOUT_COLOR_MAP[lower(v)];
                } else if (key === 'text') {
                    // chartTitle() embeds a grey subtitle span
                    v = v.replace(/color:\s*#777\b/gi, 'color:' + T.muted);
                }
            } else if (v && typeof v === 'object') {
                v = walkLayout(v, key);
            }
            out[key] = v;
        }
        return out;
    }

    function walkTrace(node, parentKey) {
        if (Array.isArray(node)) return node.map(n => walkTrace(n, parentKey));
        if (!node || typeof node !== 'object') return node;
        const out = {};
        for (const key of Object.keys(node)) {
            let v = node[key];
            if (typeof v === 'string' && key === 'color' && (parentKey === 'line' || parentKey === 'marker') && TRACE_COLOR_MAP[lower(v)]) {
                v = TRACE_COLOR_MAP[lower(v)];
            } else if (v && typeof v === 'object') {
                v = walkTrace(v, key);
            }
            out[key] = v;
        }
        return out;
    }

    const axisDefaults = { gridcolor: T.grid, zerolinecolor: T.zero, linecolor: T.grid, tickcolor: T.grid };
    const template = {
        layout: {
            paper_bgcolor: T.paper,
            plot_bgcolor: T.plot,
            font: { color: T.text, family: T.font },
            title: { font: { color: '#E6EDF3' } },
            legend: { bgcolor: 'rgba(0,0,0,0)', font: { color: T.text } },
            xaxis: axisDefaults,
            yaxis: axisDefaults,
            yaxis2: axisDefaults,
            hoverlabel: { font: { family: T.font } },
            modebar: { bgcolor: 'rgba(0,0,0,0)', color: T.muted, activecolor: '#FFB020' }
        }
    };

    function themeLayout(layout) {
        const l = walkLayout(layout || {});
        // app.js sets template: 'plotly_white' (a Python-only name plotly.js ignores);
        // replace it, but keep a real template object if one is ever passed.
        if (!l.template || typeof l.template !== 'object') l.template = template;
        return l;
    }

    // The plotly.js bundle exposes its API through non-writable getters, so the
    // wrapped functions go on a plain copy that replaces the global.
    const Orig = window.Plotly;
    const origNewPlot = Orig.newPlot;
    const origReact = Orig.react;
    const origRelayout = Orig.relayout;
    const origRestyle = Orig.restyle;
    const Themed = Object.assign({}, Orig);
    window.Plotly = Themed;

    Themed.newPlot = function (gd, data, layout, config) {
        if (data && !Array.isArray(data) && typeof data === 'object' && data.data) {
            // single-object form: newPlot(gd, {data, layout, config})
            return origNewPlot.call(Orig, gd, Object.assign({}, data, { data: walkTrace(data.data), layout: themeLayout(data.layout) }));
        }
        return origNewPlot.call(Orig, gd, walkTrace(data), themeLayout(layout), config);
    };
    Themed.react = function (gd, data, layout, config) {
        return origReact.call(Orig, gd, walkTrace(data), themeLayout(layout), config);
    };
    Themed.relayout = function (gd, update, value) {
        if (update && typeof update === 'object') return origRelayout.call(Orig, gd, walkLayout(update));
        return origRelayout.call(Orig, gd, update, value);
    };
    Themed.restyle = function (gd, update, traces) {
        if (update && typeof update === 'object') {
            const u = Object.assign({}, update);
            const mapColor = c => (typeof c === 'string' && TRACE_COLOR_MAP[lower(c)]) ? TRACE_COLOR_MAP[lower(c)] : c;
            for (const k of ['line.color', 'marker.color']) {
                if (k in u) u[k] = Array.isArray(u[k]) ? u[k].map(mapColor) : mapColor(u[k]);
            }
            if (u.line && typeof u.line === 'object') u.line = walkTrace({ line: u.line }).line;
            if (u.marker && typeof u.marker === 'object') u.marker = walkTrace({ marker: u.marker }).marker;
            return origRestyle.call(Orig, gd, u, traces);
        }
        return origRestyle.call(Orig, gd, update, traces);
    };
})();
