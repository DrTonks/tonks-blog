// Local-only production A/B harness. Never included in the deployed site.
// node scripts/theme-avatar-audit.mjs <baseline-dist> <candidate-dist>
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

function browserAudit() {
  const root = document.documentElement;
  const records = [], longTasks = [];
  const counters = { draws: 0, contextMs: 0, preparationMs: 0, contexts: 0 };
  const originalContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const avatar = this.closest('theme-avatar');
    if (avatar && args[0] === 'webgl' && new URLSearchParams(location.search).has('no-avatar-gpu')) return null;
    const begin = performance.now();
    const context = originalContext.apply(this, args);
    if (avatar && args[0] === 'webgl' && context && !context.__avatarAudit) {
      context.__avatarAudit = true;
      counters.contexts++;
      counters.contextMs += performance.now() - begin;
      for (const name of ['compileShader', 'linkProgram', 'getShaderParameter',
        'getProgramParameter', 'texImage2D', 'bufferData']) {
        const original = context[name];
        context[name] = function (...values) {
          const start = performance.now();
          try { return original.apply(this, values); }
          finally { counters.preparationMs += performance.now() - start; }
        };
      }
      const draw = context.drawArrays;
      context.drawArrays = function (...values) {
        counters.draws++;
        return draw.apply(this, values);
      };
    }
    return context;
  };
  try {
    new PerformanceObserver(list => longTasks.push(...list.getEntries()
      .map(e => ({ start: e.startTime, duration: e.duration }))))
      .observe({ type: 'longtask', buffered: true });
  } catch { /* Unsupported browsers still report frame intervals. */ }
  let active = false;
  const publish = () => {
    root.dataset.auditResults = JSON.stringify({ viewport: [innerWidth, innerHeight, devicePixelRatio],
      counters, records, resources: performance.getEntriesByType('resource')
        .filter(e => e.name.startsWith(location.origin))
        .map(e => ({ name: new URL(e.name).pathname, bytes: e.decodedBodySize,
          transfer: e.transferSize, duration: e.duration })) });
    root.dataset.auditBusy = String(active);
  };
  function measure(label, duration) {
    if (active) return;
    active = true;
    publish();
    const start = performance.now(), startDraws = counters.draws;
    const fromDark = root.classList.contains('dark');
    let avatar = document.querySelector('theme-avatar');
    const intervals = [];
    let previous = start, revealSeen = false, particleSeen = false;
    let revealEnd = null, particleEnd = null;
    const frame = now => {
      avatar ??= document.querySelector('theme-avatar');
      intervals.push(now - previous); previous = now;
      const revealing = root.classList.contains('is-theme-revealing');
      const particles = avatar?.dataset.state === 'particles';
      if (revealing) revealSeen = true;
      else if (revealSeen && revealEnd === null) revealEnd = now - start;
      if (particles) particleSeen = true;
      else if (particleSeen && particleEnd === null) particleEnd = now - start;
      if (now - start < duration) return requestAnimationFrame(frame);
      const sorted = [...intervals].sort((a,b) => a-b);
      records.push({ label, fromDark, toDark: root.classList.contains('dark'),
        viewport: [innerWidth, innerHeight, devicePixelRatio],
        duration: now-start, frames: intervals.length,
        p95: sorted[Math.floor(sorted.length*.95)], max: sorted.at(-1),
        over25: intervals.filter(x => x > 25).length,
        over50: intervals.filter(x => x > 50).length,
        longTasks: longTasks.filter(x => x.start >= start && x.start < now),
        draws: counters.draws-startDraws, revealEnd, particleEnd,
        avatarState: avatar?.dataset.state ?? 'no-particles' });
      active = false;
      publish();
    };
    requestAnimationFrame(frame);
  }
  document.addEventListener('click', event => {
    if (event.target.closest?.('#scheme-switch')) measure('theme', 1600);
    if (event.target.closest?.('#avatar-audit-idle')) measure('idle', 2000);
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.createElement('button');
    button.id = 'avatar-audit-idle';
    button.textContent = 'Measure idle (2s)';
    button.style.cssText = 'position:fixed;bottom:6px;right:6px;z-index:999999;font:12px monospace;background:#fff;color:#111;padding:4px;border:1px solid #555';
    document.body.append(button);
  });
  measure('startup', 5000);
}

const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.jpg':'image/jpeg',
  '.woff2':'font/woff2', '.json':'application/json' };
for (const [i, directory] of process.argv.slice(2, 4).entries()) {
  const base = resolve(directory);
  createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let file = resolve(base, '.' + decodeURIComponent(url.pathname));
      if (file !== base && !file.startsWith(base + sep)) throw Error('Invalid path');
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      let data = await readFile(file);
      if (extname(file) === '.html' && url.searchParams.has('audit')) {
        data = Buffer.from(data.toString().replace('<head>',
          `<head><script>(${browserAudit.toString()})()</script>`));
      }
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store' });
      res.end(data);
    } catch { res.writeHead(404); res.end('Not found'); }
  }).listen(4325 + i, '127.0.0.1', () => console.log(`${i ? 'candidate' : 'baseline'}: http://127.0.0.1:${4325+i}/?audit=1`));
}
