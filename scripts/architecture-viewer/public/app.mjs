import mermaid from '/vendor/mermaid.esm.min.mjs';

mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    maxTextSize: 30_000,
    maxEdges: 300,
    htmlLabels: false,
    secure: [
        'secure',
        'securityLevel',
        'startOnLoad',
        'maxTextSize',
        'maxEdges',
        'suppressErrorRendering',
        'htmlLabels',
    ],
    theme: 'base',
    themeVariables: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        primaryColor: '#eee8fc',
        primaryTextColor: '#2b2430',
        primaryBorderColor: '#b5a7d9',
        lineColor: '#7c708b',
        secondaryColor: '#f3f6fa',
        tertiaryColor: '#faf9fc',
    },
    flowchart: { htmlLabels: false, useMaxWidth: false, curve: 'basis' },
    sequence: { useMaxWidth: false, wrap: true },
});

const $ = (id) => document.getElementById(id);
let diagrams = [];
let selected;
let renderGeneration = 0;
let svg;
let naturalWidth = 1;
let naturalHeight = 1;
let scale = 1;
let fitted = true;

function resize() {
    if (!svg) return;
    $('canvas').style.width = `${naturalWidth * scale}px`;
    $('canvas').style.height = `${naturalHeight * scale}px`;
    svg.style.transform = `scale(${scale})`;
    $('zoom-level').textContent = `${Math.round(scale * 100)}%`;
    $('zoom-in').disabled = scale >= 3;
    $('zoom-out').disabled = scale <= 0.15;
}
function fit() {
    if (!svg) return;
    const viewport = $('viewport');
    scale = Math.max(
        0.15,
        Math.min(
            1,
            (viewport.clientWidth - 48) / naturalWidth,
            (viewport.clientHeight - 48) / naturalHeight,
        ),
    );
    fitted = true;
    resize();
    viewport.scrollTo(0, 0);
}
function zoom(factor) {
    fitted = false;
    scale = Math.min(3, Math.max(0.15, scale * factor));
    resize();
}
function navigation() {
    const query = $('search').value.trim().toLowerCase();
    const matching = diagrams.filter((diagram) =>
        `${diagram.title} ${diagram.summary} ${diagram.id}`
            .toLowerCase()
            .includes(query),
    );
    $('navigation').replaceChildren(
        ...matching.map((diagram) => {
            const link = document.createElement('a');
            link.href = `#${diagram.id}`;
            link.textContent = diagram.title;
            if (diagram.id === selected?.id)
                link.setAttribute('aria-current', 'page');
            return link;
        }),
    );
    $('search-empty').hidden = matching.length !== 0;
}

async function selectDiagram(id) {
    const diagram =
        diagrams.find((item) => item.id === id) ??
        diagrams.find((item) => item.id === 'system-context') ??
        diagrams[0];
    selected = diagram;
    navigation();
    if (!diagram) {
        $('workspace').hidden = true;
        $('diagram-title').textContent = 'No diagrams available';
        $('summary').textContent =
            'Run pnpm diagrams:check and inspect docs/diagrams.';
        return;
    }
    const generation = ++renderGeneration;
    $('workspace').hidden = false;
    $('diagram-title').textContent = diagram.title;
    document.title = `${diagram.title} · Languon architecture`;
    $('summary').textContent = diagram.summary;
    $('freshness').textContent = diagram.fresh
        ? '● Sources unchanged since review'
        : '● Sources changed — diagram needs review';
    $('freshness').dataset.stale = String(!diagram.fresh);
    $('reviewed').textContent = `Reviewed ${diagram.reviewed}`;
    $('document-path').textContent = diagram.file;
    $('notes').textContent = diagram.notes;
    $('mermaid-source').textContent = diagram.mermaid;
    $('sources').replaceChildren(
        ...diagram.source_paths.map((path) => {
            const item = document.createElement('li');
            item.textContent = path;
            return item;
        }),
    );
    $('render-status').textContent = 'Rendering diagram…';
    svg = undefined;
    $('canvas').replaceChildren();
    try {
        const result = await mermaid.render(
            `diagram-${generation}`,
            diagram.mermaid,
        );
        if (generation !== renderGeneration) return;
        // Mermaid strict mode sanitizes its SVG. Import only the SVG root;
        // document notes, filenames and metadata are always inserted as text.
        const parsed = new DOMParser().parseFromString(
            result.svg,
            'image/svg+xml',
        );
        const root = parsed.documentElement;
        if (root.localName !== 'svg')
            throw new Error('Invalid rendered diagram.');
        svg = document.importNode(root, true);
        const viewBox = svg.getAttribute('viewBox').split(/[ ,]+/u).map(Number);
        naturalWidth = viewBox[2];
        naturalHeight = viewBox[3];
        svg.setAttribute('width', String(naturalWidth));
        svg.setAttribute('height', String(naturalHeight));
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', diagram.title);
        $('canvas').replaceChildren(svg);
        $('render-status').textContent = '';
        fit();
    } catch {
        if (generation !== renderGeneration) return;
        $('render-status').textContent =
            'Unable to render this diagram. Inspect Sources and Mermaid, then run pnpm diagrams:check.';
    }
}

async function refresh() {
    $('refresh').disabled = true;
    try {
        const response = await fetch('/api/diagrams', {
            cache: 'no-store',
            credentials: 'omit',
        });
        if (!response.ok) throw new Error('Catalog unavailable.');
        const catalog = await response.json();
        diagrams = catalog.diagrams;
        $('catalog-issues').hidden = catalog.issues.length === 0;
        $('catalog-issues').textContent = catalog.issues
            .map((issue) => `${issue.file}: ${issue.message}`)
            .join('\n');
        await selectDiagram(location.hash.slice(1));
    } catch {
        $('catalog-issues').hidden = false;
        $('catalog-issues').textContent =
            'Unable to load diagrams. Check the local server and retry Refresh sources.';
    } finally {
        $('refresh').disabled = false;
    }
}
$('search').addEventListener('input', navigation);
$('refresh').addEventListener('click', refresh);
$('zoom-in').addEventListener('click', () => zoom(1.25));
$('zoom-out').addEventListener('click', () => zoom(0.8));
$('fit').addEventListener('click', fit);
window.addEventListener('hashchange', () =>
    selectDiagram(location.hash.slice(1)),
);
new ResizeObserver(() => {
    if (fitted) fit();
}).observe($('viewport'));
await refresh();
