// Run against a local dev/preview server. PLAYWRIGHT_MODULE_PATH can point to
// the bundled Playwright entry point when it isn't installed in this project.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const origin = process.argv[2] || 'http://127.0.0.1:4321';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
const errors = [];
const analyticsErrors = [];
page.on('pageerror', error => {
    const stack = error.stack || error.message;
    // Clarity's remote recorder can fail during rapid DOM replacement. Keep
    // its diagnostics visible without attributing them to our animation code.
    (stack.includes('https://scripts.clarity.ms/') ? analyticsErrors : errors).push(stack);
});

async function click(href) {
    await page.evaluate(href => {
        const link = document.createElement('a');
        link.href = href;
        document.body.append(link);
        link.click();
        link.remove();
    }, href);
}

async function settle() {
    await page.waitForTimeout(1400);
    assert.equal(await page.evaluate(() => document.body.dataset.bannerNavigation), undefined);
    assert.equal(await page.evaluate(() => document.getElementById('main-grid').style.transition), '');
}

async function state() {
    return page.evaluate(() => ({
        path: location.pathname,
        y: scrollY,
        top: document.getElementById('main-grid').getBoundingClientRect().top,
    }));
}

async function trajectory(name, href, y, back = false) {
    await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), y);
    await page.waitForTimeout(150);
    await page.evaluate(() => {
        window.bannerSamples = [];
        window.bannerSamplesDone = false;
        window.bannerReplacedAt = undefined;
        const start = performance.now();
        window.bannerSampleStart = start;
        const sample = () => {
            const grid = document.getElementById('main-grid');
            window.bannerSamples.push({
                time: performance.now() - start,
                top: grid.getBoundingClientRect().top,
                active: document.body.dataset.bannerNavigation === 'true',
            });
            if (performance.now() - start < 1600) requestAnimationFrame(sample);
            else window.bannerSamplesDone = true;
        };
        sample();
    });
    if (back) await page.evaluate(() => history.back());
    else await click(href);
    await page.waitForFunction(() => window.bannerSamplesDone);
    const samples = await page.evaluate(() => window.bannerSamples);
    const first = samples[0].top;
    const last = samples.at(-1).top;
    const positions = samples.map(sample => sample.top);
    const overshoot = Math.max(0, Math.min(first, last) - Math.min(...positions), Math.max(...positions) - Math.max(first, last));
    // Allow CSS subpixel transforms versus integer window scroll rounding.
    assert.ok(overshoot < 1, `${name}: reversed beyond endpoints by ${overshoot}px`);
    const active = samples.filter(sample => sample.active);
    const gaps = active.slice(1).map((sample, index) => sample.time - active[index].time).sort((a, b) => a - b);
    assert.ok(active.length > 0, `${name}: coordinated animation did not run`);
    const replacedAt = await page.evaluate(() => window.bannerReplacedAt - window.bannerSampleStart);
    const firstMotion = samples.find(sample => Math.abs(sample.top - first) > 0.1)?.time;
    assert.ok(firstMotion < replacedAt, `${name}: motion waited for content replacement`);
    assert.equal(await page.evaluate(() => document.body.dataset.bannerNavigation), undefined);
    console.log(name, { overshoot, firstMotion, replacedAt, p95FrameGap: gaps[Math.floor(gaps.length * 0.95)], maxFrameGap: gaps.at(-1) });
}

async function interruptWithWheel() {
    await page.evaluate(() => {
        window.originalBannerScrollTo = window.scrollTo;
        window.bannerScrollCalls = 0;
        window.scrollTo = (...args) => {
            window.bannerScrollCalls++;
            window.originalBannerScrollTo(...args);
        };
    });
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(70);
    const calls = await page.evaluate(() => window.bannerScrollCalls);
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => window.bannerScrollCalls), calls, 'animation took scrolling back after wheel input');
    await page.evaluate(() => { window.scrollTo = window.originalBannerScrollTo; });
}

try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.swup?.hooks);
    await page.evaluate(() => window.swup.hooks.before('content:replace', () => { window.bannerReplacedAt = performance.now(); }));
    await page.waitForTimeout(1800);
    for (const y of [280, 0, 100, 700]) {
        await trajectory(`home → archive at ${y}`, '/archive/', y);
        assert.equal((await state()).y, 0);
        await trajectory(`archive → home at ${y}`, '/', y);
        assert.equal((await state()).y, 0);
    }
    await trajectory('home → archive before history restore', '/archive/', 700);
    await trajectory('history → home', '/', 280, true);
    assert.equal((await state()).y, 700);
    await trajectory('deep home → archive', '/archive/', 1600);

    await click('/');
    await settle();
    const article = await page.locator('a[href^="/posts/"]').first().getAttribute('href');
    assert.ok(article, 'a real article is required for the sidebar-layout regression');
    for (const href of ['/about/', article, '/archive/?category=__banner_empty__']) {
        await trajectory(`home → ${href}`, href, 280);
        await trajectory(`${href} → home`, '/', 280);
    }

    for (const href of ['/#main-grid', '/archive/#main-grid']) {
        await click(href);
        await settle();
        assert.ok(Math.abs((await state()).top) < 1, `incorrect anchor position for ${href}`);
    }

    await click('/');
    await page.waitForFunction(() => !window.swup.navigating);
    await click('/#main-grid');
    await settle();
    assert.ok(Math.abs((await state()).top) < 1, 'same-page anchor during animation');

    await click('/archive/');
    await page.waitForFunction(() => document.body.dataset.bannerNavigation === 'true');
    await interruptWithWheel();
    await page.waitForFunction(() => !window.swup.navigating);
    await click('/archive/');
    await interruptWithWheel();
    await settle();

    await click('/');
    await page.waitForFunction(() => document.body.dataset.bannerNavigation === 'true');
    await page.setViewportSize({ width: 1400, height: 1000 });
    await settle();
    const transform = await page.evaluate(() => getComputedStyle(document.getElementById('main-grid')).transform);
    assert.ok(transform.includes('300'), 'resize retained the old 256px banner offset');

    await page.setViewportSize({ width: 1536, height: 864 });
    await page.evaluate(() => scrollTo({ top: 700, behavior: 'instant' }));
    await click('/archive/');
    await page.waitForFunction(() => document.body.dataset.bannerNavigation === 'true');
    await page.setViewportSize({ width: 1450, height: 900 });
    await settle();
    assert.equal((await state()).y, 0, 'resize cancelled scrolling but suppressed the later restoration');
    await click('/');
    await settle();
    await page.setViewportSize({ width: 1536, height: 864 });
    const stacking = await page.evaluate(() => ({
        cards: Number(getComputedStyle(document.getElementById('home-sticker-motion')).zIndex),
        veil: Number(getComputedStyle(document.querySelector('.home-sticker-layer__veil')).zIndex),
    }));
    assert.ok(stacking.cards > stacking.veil, 'banner veil covers sticker cards');
    await click('/archive/');
    await page.waitForFunction(() => document.body.dataset.bannerNavigation === 'true');
    await page.waitForTimeout(80);
    await click('/');
    await settle();
    assert.equal((await state()).path, '/');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await click('/archive/');
    await settle();
    assert.equal((await state()).y, 0);
    await click('/');
    await settle();
    assert.equal((await state()).y, 0);
    await page.evaluate(() => scrollTo({ top: 700, behavior: 'instant' }));
    await click('/archive/');
    await settle();
    await page.evaluate(() => history.back());
    await settle();
    assert.equal((await state()).y, 700, 'reduced-motion navigation overwrote the history position');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 390, height: 844 });
    await click('/archive/');
    await settle();
    assert.equal((await state()).path, '/archive/');
    await click('/');
    await settle();
    assert.equal((await state()).path, '/');
    assert.deepEqual(errors, []);
    if (analyticsErrors.length) console.warn('External analytics errors:', analyticsErrors);
    console.log('PASS: trajectories, history, anchors, repeated input, resize, rapid visits, reduced motion, mobile');
} finally {
    await browser.close();
}
