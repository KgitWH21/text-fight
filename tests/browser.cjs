// npm i -D playwright && npx playwright install chromium (only for browser QA).
// An existing local Playwright install may be supplied with PLAYWRIGHT_PATH and CHROMIUM_PATH.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..'), results = path.join(root, 'test-results');
fs.mkdirSync(results, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
async function main() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname.replace(/^\/text-fight-2\//, '/');
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => { if (error) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-cache' }); res.end(bytes); });
  });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const width of [412, 1440]) {
      const mobile = width === 412;
      const context = await browser.newContext({ viewport: { width, height: mobile ? 915 : 1000 }, isMobile: mobile, hasTouch: mobile, permissions: ['clipboard-read', 'clipboard-write'] });
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/text-fight-2/'); await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => navigator.serviceWorker.controller);
      await page.waitForFunction(() => !!localStorage.getItem('text-fight-v1'));
      const base = 'teh ' + Array.from({ length: 2999 }, (_, i) => `old${i}`).join(' ');
      await page.evaluate(base => { const s = JSON.parse(localStorage.getItem('text-fight-v1')); s.drafts[0].text = base; s.drafts[0].title = 'The rain at Blackwater'; s.settings.categories.continue = ['craftDevices']; localStorage.setItem('text-fight-v1', JSON.stringify(s)); }, base);
      await page.reload(); await page.locator('#continueButton').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('text-fight-v1')).drafts[0].round?.card);
      assert.equal(await page.locator('#sessionCount').textContent(), '+0');
      const added = Array.from({ length: 120 }, (_, i) => `new${i}`).join(' ');
      const editor = page.locator('#editor'); await editor.focus(); await editor.press('Control+End'); await page.keyboard.insertText('\n\n' + added);
      assert.equal(await page.locator('#sessionCount').textContent(), '+120');
      await editor.evaluate(el => { el.focus(); el.setSelectionRange(0, 3); }); await page.keyboard.insertText('the');
      assert.equal(await page.locator('#sessionCount').textContent(), '+120');
      assert.deepEqual(await editor.evaluate(el => [el.selectionStart, el.selectionEnd, document.activeElement === el]), [3, 3, true]);
      await editor.evaluate(el => { const start = el.value.indexOf(' new105'); el.setSelectionRange(start, el.value.length); }); await page.keyboard.press('Backspace');
      assert.equal(await page.locator('#sessionCount').textContent(), '+105');
      await editor.press('Control+z'); assert.equal(await page.locator('#sessionCount').textContent(), '+120');
      await editor.press('Control+y'); assert.equal(await page.locator('#sessionCount').textContent(), '+105');
      const beforeRefresh = await page.evaluate(() => JSON.parse(localStorage.getItem('text-fight-v1')));
      assert.equal(beforeRefresh.xp, 120); await page.reload();
      assert.equal(await page.locator('#sessionCount').textContent(), '+105'); assert.equal(await editor.inputValue(), beforeRefresh.drafts[0].text);
      assert.equal(await page.locator('#lifetimeXP').textContent(), '120 lifetime XP');
      const card = await page.locator('#promptTitle').textContent();
      await editor.focus(); await editor.evaluate(el => el.setSelectionRange(8, 8));
      const caret = await editor.evaluate(el => el.selectionStart);
      // Timer changes and prompt updates never write to the textarea.
      await page.locator('#pace').selectOption('hard');
      assert.equal(await page.locator('#promptTitle').textContent(), card);
      assert.equal(await editor.evaluate(el => el.selectionStart), caret);
      assert.equal(await page.locator('#sessionCount').textContent(), '+105');
      await editor.focus(); await page.locator('#pinButton').click();
      assert.equal(await page.locator('#pinButton').getAttribute('aria-pressed'), 'true');
      assert.equal(await editor.evaluate(el => document.activeElement === el), true);
      await page.locator('#nextButton').click(); assert.equal(await page.locator('#promptTitle').textContent(), card);
      await page.locator('#pinButton').click(); await page.locator('#nextButton').click(); assert.notEqual(await page.locator('#promptTitle').textContent(), card);
      assert.equal(await editor.evaluate(el => document.activeElement === el), true);
      await page.locator('#usedButton').click(); assert.equal(await page.locator('#lifetimeXP').textContent(), '125 lifetime XP');
      await page.locator('#usedButton').evaluate(el => el.click()); assert.equal(await page.locator('#lifetimeXP').textContent(), '125 lifetime XP');
      await page.locator('#pauseButton').click(); assert.equal(await page.locator('#roundStatus').textContent(), 'PAUSED');
      const remaining = await page.evaluate(() => JSON.parse(localStorage.getItem('text-fight-v1')).drafts[0].round.remaining);
      await page.waitForTimeout(1100);
      await page.locator('#pauseButton').click();
      assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('text-fight-v1')).drafts[0].round.remaining) <= remaining);
      await page.locator('#toolsButton').click(); await page.locator('#copySession').click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), added.split(' ').slice(0, 105).join(' '));
      await page.getByRole('button', { name: 'Close draft tools', exact: true }).click();
      await context.setOffline(true); await page.reload();
      assert.equal(await page.locator('#sessionCount').textContent(), '+105');
      await page.locator('#nextButton').click(); assert.ok(await page.locator('#promptTitle').textContent());
      await editor.focus(); await editor.press('Control+End'); await page.keyboard.insertText(' seventeen fresh words arrive after the offline reload and cross the old high water mark today safely');
      assert.equal(await page.locator('#sessionCount').textContent(), '+122');
      assert.equal(await page.locator('#lifetimeXP').textContent(), '142 lifetime XP');
      // A real new browsing session restores the same device storage.
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(results, `writing-${width}.png`) });
      if (mobile) {
        await page.setViewportSize({ width: 412, height: 430 }); await editor.focus();
        const box = await editor.boundingBox(); assert.ok(box.height >= 100, `Keyboard-height editor too small: ${box.height}`);
        await page.screenshot({ path: path.join(results, 'writing-keyboard-height.png') });
      }
      assert.deepEqual(errors, []); await context.close();
      console.log(`PASS ${width}px: regression, caret, pace, pin, XP, copy, persistence, offline, layout`);
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
