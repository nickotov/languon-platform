#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateObservation } from './lib.mjs';

const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../..',
);
export const defaultHistoryPath = resolve(
    repositoryRoot,
    'docs/operations/resource-profile/history.jsonl',
);
export const defaultDashboardPath = resolve(
    repositoryRoot,
    '.artifacts/resource-profile/dashboard.html',
);

export function parseHistory(text) {
    return text
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line, index) => {
            try {
                return validateObservation(JSON.parse(line));
            } catch (error) {
                throw new Error(
                    `Invalid resource history line ${index + 1}: ${error.message}`,
                    { cause: error },
                );
            }
        });
}

const jsonForHtml = (value) =>
    JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');

export function renderDashboard(observations) {
    const data = jsonForHtml(observations);
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
  <title>Languon resource profile</title>
  <style>
    :root { color-scheme: dark; font: 14px/1.5 system-ui,sans-serif; background:#111827; color:#e5e7eb }
    body { max-width:1200px; margin:auto; padding:32px } h1 { margin-bottom:4px } p { color:#9ca3af }
    .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin:24px 0 }
    .card, table { background:#1f2937; border:1px solid #374151; border-radius:8px } .card { padding:16px }
    .value { font-size:22px; font-weight:650 } .bad { color:#fca5a5 } .ok { color:#86efac }
    table { width:100%; border-collapse:collapse; overflow:hidden } th,td { padding:9px; text-align:left; border-bottom:1px solid #374151; white-space:nowrap }
    th { color:#9ca3af } .scroll { overflow:auto } svg { width:100%; height:80px } .empty { padding:32px; text-align:center }
  </style>
</head>
<body>
  <h1>Languon resource profile</h1>
  <p>Sanitized, comparable production build and runtime measurements. Raw run artifacts stay local.</p>
  <main id="app"></main>
  <script>
    const observations=${data};
    const esc=(v)=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const bytes=(v)=>v==null?'—':(v/1024/1024).toFixed(1)+' MiB';
    const latest=observations.at(-1);
    const value=(phase,key)=>latest?.runtime?.[phase]?.resources?.[key];
    const series=(getter)=>observations.map(getter).filter(Number.isFinite);
    const spark=(values,color='#60a5fa')=>{ if(!values.length)return '—'; const max=Math.max(...values,1), w=300,h=70; return '<svg viewBox="0 0 '+w+' '+h+'" aria-hidden="true"><polyline fill="none" stroke="'+color+'" stroke-width="3" points="'+values.map((v,i)=>(i*(w/Math.max(1,values.length-1)))+','+(h-v/max*h)).join(' ')+'"/></svg>' };
    if(!latest){ document.querySelector('#app').innerHTML='<div class="card empty">No recorded profiles yet. Run <code>pnpm resources:profile -- --record</code>.</div>'; }
    else {
      const flags=latest.flags||[], comparable=latest.comparability?.comparable;
      const cards=[
        ['Build time', ((latest.builds||[]).reduce((s,b)=>s+(b.durationMs||0),0)/1000).toFixed(1)+'s', series(o=>(o.builds||[]).reduce((s,b)=>s+(b.durationMs||0),0))],
        ['Image total', bytes((latest.builds||[]).reduce((s,b)=>s+(b.imageSizeBytes||0),0)), series(o=>(o.builds||[]).reduce((s,b)=>s+(b.imageSizeBytes||0),0))],
        ['Load CPU peak', (value('load','cpuPeakPercent')??'—')+'%', series(o=>o.runtime?.load?.resources?.cpuPeakPercent)],
        ['Overlap memory', bytes(value('overlap','memoryPeakBytes')), series(o=>o.runtime?.overlap?.resources?.memoryPeakBytes)],
      ];
      document.querySelector('#app').innerHTML='<div class="cards">'+cards.map(c=>'<section class="card"><div>'+esc(c[0])+'</div><div class="value">'+esc(c[1])+'</div>'+spark(c[2])+'</section>').join('')+'</div><p class="'+(flags.length?'bad':'ok')+'">'+(flags.length?'Threshold flags: '+esc(flags.join(', ')):'All configured thresholds passed')+' · '+(comparable?'Comparable with previous run':'Not comparable: '+esc(latest.comparability?.reason))+'</p><div class="scroll"><table><thead><tr><th>Recorded</th><th>Revision</th><th>Host</th><th>Build</th><th>Load p95</th><th>Error rate</th><th>Overlap CPU</th><th>Flags</th></tr></thead><tbody>'+observations.slice().reverse().map(o=>'<tr><td>'+esc(o.recordedAt)+'</td><td><code>'+esc(o.revision.slice(0,12))+'</code></td><td><code>'+esc(o.host.id)+'</code></td><td>'+esc(((o.builds||[]).reduce((s,b)=>s+(b.durationMs||0),0)/1000).toFixed(1))+'s</td><td>'+esc(o.runtime?.load?.load?.latencyMs?.p95)+'ms</td><td>'+esc(o.runtime?.load?.load?.errorRatePercent)+'%</td><td>'+esc(o.runtime?.overlap?.resources?.cpuPeakPercent)+'%</td><td class="'+((o.flags||[]).length?'bad':'ok')+'">'+esc((o.flags||[]).join(', ')||'pass')+'</td></tr>').join('')+'</tbody></table></div>';
    }
  </script>
</body>
</html>`;
}

export async function generateDashboard({
    historyPath = defaultHistoryPath,
    outputPath = defaultDashboardPath,
} = {}) {
    let text = '';
    try {
        text = await readFile(historyPath, 'utf8');
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const observations = parseHistory(text);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, renderDashboard(observations), 'utf8');
    return { observations: observations.length, outputPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const historyIndex = process.argv.indexOf('--history');
    const outputIndex = process.argv.indexOf('--output');
    const result = await generateDashboard({
        historyPath:
            historyIndex >= 0
                ? resolve(process.argv[historyIndex + 1])
                : undefined,
        outputPath:
            outputIndex >= 0
                ? resolve(process.argv[outputIndex + 1])
                : undefined,
    });
    console.log(
        `Resource dashboard: ${result.outputPath} (${result.observations} observations)`,
    );
}
