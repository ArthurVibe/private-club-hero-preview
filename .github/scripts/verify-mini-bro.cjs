'use strict';
// Local, deterministic visual checks. Playwright is not a website dependency.
const { chromium } = require(process.env.PRIVATE_CLUB_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const out = process.env.MINI_BRO_OUTPUT_DIR || path.join(root, 'docs/previews/mini-bro-v1');
const references = process.env.MINI_BRO_REFERENCE_DIR || '/tmp/mini-bro-references';
const url = process.env.PRIVATE_CLUB_PREVIEW_URL || 'http://127.0.0.1:8792/';
const base = '5a4810f0a4a40b7a377a38728ae4ae7a85af5f1c';
const report = { baseline: base, viewports: [], retina: [], errors: [] };
const selectors = ['.hero', '.header-inner', '.brand', '.wordmark-top', '.wordmark-bottom',
  '.brand-tagline', '.main-nav', '.invitation', '.hero-content', '.hero-title',
  '.hero-tagline', '.hero-description', '.hero-actions', '#meet-bro', '.button-outline',
  '.hero-scene', '#club-photo', '#meet-bro svg', '.button-outline svg'];
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(references, { recursive: true });
const baseline = process.env.MINI_BRO_BASELINE_FILE
  ? fs.readFileSync(process.env.MINI_BRO_BASELINE_FILE, 'utf8')
  : cp.execFileSync('git', ['show', `${base}:index.html`], { cwd: root, encoding: 'utf8' });
const source = fs.readFileSync(process.env.MINI_BRO_SOURCE_FILE || path.join(root, 'index.html'), 'utf8');
const restored = source
  .replace(/\n    \/\* Static Mini Bro experiment\.[\s\S]*?(?=\n  <\/style>)/, '')
  .replace(/\n      <picture class="mini-bro"[\s\S]*?<\/picture>/, '');
assert.equal(restored, baseline, 'Only the Mini Bro CSS and picture may change the approved HTML');
const ready = async page => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
  });
  await page.waitForTimeout(700);
};
const geometry = page => page.evaluate(selectors => Object.fromEntries(selectors.map(selector => {
  const element = document.querySelector(selector);
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return [selector, { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    font: style.fontFamily, size: style.fontSize, lineHeight: style.lineHeight }];
})), selectors);
const iconState = page => page.locator('.mini-bro').evaluate(element => {
  const r = element.getBoundingClientRect();
  const c = getComputedStyle(element);
  const image = element.querySelector('img');
  return { x: r.x, y: r.y, width: r.width, height: r.height, right: innerWidth - r.right,
    bottom: innerHeight - r.bottom, position: c.position, pointerEvents: c.pointerEvents,
    transform: c.transform, animations: element.getAnimations({ subtree: true }).length,
    heroParent: element.offsetParent === document.querySelector('.hero'),
    decorative: element.getAttribute('aria-hidden') === 'true' && image.alt === '',
    noInteractiveChildren: !element.querySelector('a, button, [tabindex]'),
    loaded: image.complete && image.naturalWidth > 0, currentSrc: image.currentSrc,
    hitThrough: !document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      .some(hit => hit === element || element.contains(hit)) };
});
let browser;
(async () => {
  browser = await chromium.launch({ executablePath: process.env.PRIVATE_CLUB_CHROMIUM_EXECUTABLE,
    args: ['--no-sandbox'] });
  report.browser = await browser.version();
  report.sourceChangeLimitedToIcon = true;
  for (const [width, height, name, size, inset] of [
    [1440, 900, 'desktop-1440x900', 64, 24],
    [1280, 800, 'desktop-1280x800', 64, 24],
    [390, 844, 'mobile-390x844', 48, 16]
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const reference = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('requestfailed', request => report.errors.push(request.url()));
    await reference.route(`${url}__mini_bro_reference.html`, route =>
      route.fulfill({ contentType: 'text/html', body: baseline }));
    await reference.goto(`${url}__mini_bro_reference.html`);
    await page.goto(url);
    await ready(reference);
    await ready(page);
    const before = await geometry(reference);
    const after = await geometry(page);
    assert.deepEqual(after, before, `${name}: approved geometry changed`);
    const icon = await iconState(page);
    assert.equal(icon.width, size);
    assert.equal(icon.height, size);
    assert.equal(icon.right, inset);
    assert.equal(icon.bottom, inset);
    assert(icon.x >= 0 && icon.y >= 0 && icon.x + size <= width && icon.y + size <= height);
    assert.equal(icon.position, 'absolute');
    assert.equal(icon.pointerEvents, 'none');
    assert.equal(icon.transform, 'none');
    assert.equal(icon.animations, 0);
    assert(icon.heroParent && icon.decorative && icon.noInteractiveChildren && icon.loaded && icon.hitThrough);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const selector of ['.brand', '.hero-title', '.hero-tagline', '.hero-description',
      '.hero-actions', '.menu-toggle', '.invitation']) {
      const r = await page.locator(selector).boundingBox();
      if (r) assert(!(icon.x < r.x + r.width && icon.x + size > r.x &&
        icon.y < r.y + r.height && icon.y + size > r.y), `${name}: icon overlaps ${selector}`);
    }
    await reference.screenshot({ path: path.join(references, `${name}.png`) });
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    if (width === 390) {
      await page.evaluate(() => scrollTo(0, 24));
      await page.waitForTimeout(80);
      const scroll = await page.evaluate(() => scrollY);
      assert(scroll > 0);
      assert.equal((await iconState(page)).y + scroll, icon.y, 'Icon must scroll with Hero');
      await page.evaluate(() => scrollTo(0, 0));
      await page.locator('#menu-toggle').click();
      await page.locator('.invitation').click();
      assert.equal(await page.locator('#notice-message').innerText(), 'Coming soon');
      await page.locator('#notice-close').click();
      assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'false');
    } else {
      await page.locator('#meet-bro').hover();
      await page.waitForTimeout(500);
      assert.equal(await page.locator('#meet-bro .button-face').evaluate(element =>
        new DOMMatrix(getComputedStyle(element).transform).m42), -6);
      assert.deepEqual(await iconState(page), icon, 'Mini Bro must stay static during hover');
      await page.locator('#meet-bro').click();
      assert.equal(await page.locator('#notice-message').innerText(), 'Coming soon');
    }
    report.viewports.push({ name, viewport: { width, height }, dpr: 1, icon,
      geometryUnchanged: true, noControlOverlap: true, noHorizontalOverflow: true,
      existingControlsPassed: true });
    await page.close();
    await reference.close();
    console.log('PASS', name);
  }
  for (const [width, height, label] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
    await page.goto(url);
    await ready(page);
    const icon = await iconState(page);
    assert(icon.currentSrc.endsWith('-128.webp'), `${label}: expected Retina WebP`);
    await page.locator('.mini-bro source').evaluate(source => source.remove());
    await page.locator('.mini-bro img').evaluate(image => image.decode());
    const fallback = await iconState(page);
    assert(fallback.currentSrc.endsWith('-128.png'), `${label}: expected Retina PNG fallback`);
    report.retina.push({ label, dpr: 2, webp: icon.currentSrc, pngFallback: fallback.currentSrc });
    await page.close();
    const close = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 4 });
    await close.goto(url);
    await ready(close);
    const r = await close.locator('.mini-bro').boundingBox();
    const pad = label === 'mobile' ? 12 : 20;
    await close.screenshot({ path: path.join(out, `${label}-icon-closeup-4x.png`),
      clip: { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 } });
    await close.close();
  }
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
  await browser.close();
})().catch(async error => {
  report.status = 'failed'; report.failure = error.stack;
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
  console.error(error); await browser?.close(); process.exitCode = 1;
});
