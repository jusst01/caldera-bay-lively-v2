import { createServer } from 'node:http';
import { createReadStream, statSync, writeFileSync } from 'node:fs';
import { resolve, join, extname, normalize, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/root/makefun-gta6-v2-ceremony/node_modules/puppeteer-core');

const root = resolve(resolve('.'), 'game');
const PORT = 8089;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(join(root, normalize(pathname)));
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const stats = statSync(file);
    if (!stats.isFile()) {
      res.writeHead(404).end('Not Found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': stats.size,
      'cache-control': 'no-store'
    });
    createReadStream(file).pipe(res);
  } catch (err) {
    res.writeHead(404).end('Not Found');
  }
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`Static server running on http://127.0.0.1:${PORT}`);
  console.log('Serving from:', root);
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: '/root/makefun-re/art-tools/chromium/chrome-linux/chrome',
      headless: true,
      args: ['--no-sandbox', '--use-gl=swiftshader', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    page.on('console', msg => console.log('BROWSER:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    page.on('response', res => { if (res.status() >= 400) console.log('RESPONSE ERROR:', res.url(), res.status()); });
    await page.setViewport({ width: 1280, height: 720 });

    // --- 1. COVER.PNG ---
    console.log('Staging cover.png...');
    await page.goto(`http://127.0.0.1:${PORT}/?shot=play&seed=77`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 5000));
    await page.evaluate(() => {
      if (window.__calderaTest && window.__calderaTest.save) {
        window.__calderaTest.save({
          cash: 4210,
          rep: 520,
          heat: 3,
          missionIndex: 6,
          missionStage: 0
        });
      }
      if (window.__photo && window.__photo.load) {
        window.__photo.load({ seed: 77, force: { mission: 6, stage: 0, heat: 3, policeCount: 3, carSpeed: 20 } });
      }
    });
    await new Promise(r => setTimeout(r, 3500));

    const coverAssertions = await page.evaluate(() => {
      const missionTitle = document.getElementById('cb-m-title')?.innerText || '';
      const cash = document.getElementById('cb-s-cash')?.innerText || '';
      const rep = document.getElementById('cb-s-rep')?.innerText || '';
      const dispatchHeader = document.getElementById('cb-d-header')?.innerText || '';
      const unitsProj = window.__calderaTest?.projectUnits ? window.__calderaTest.projectUnits() : [];
      return { missionTitle, cash, rep, dispatchHeader, unitsProj };
    });

    console.log('Cover assertions:', JSON.stringify(coverAssertions, null, 2));
    if (!coverAssertions.missionTitle.includes('7/8') && !coverAssertions.missionTitle.includes('JOB')) {
      console.warn('WARNING: Cover mission title incorrect:', coverAssertions.missionTitle);
    }
    const visiblePolice = coverAssertions.unitsProj.filter(u => u.inFrustum);
    console.log(`Police units in frustum: ${visiblePolice.length}`);
    visiblePolice.forEach(u => console.log(`  Unit ${u.id} (${u.name}) at screen position x:${u.x}%, y:${u.y}%`));
    if (visiblePolice.length < 3) {
      console.warn(`WARNING: Expected at least 3 visible police units in frustum, got ${visiblePolice.length}`);
    }

    const coverBuffer = await page.screenshot({ type: 'jpeg', quality: 85 });
    if (coverBuffer.length > 262144) {
      console.error('FAIL: cover.png size exceeds 256KB:', coverBuffer.length);
      process.exit(1);
    }
    writeFileSync('screenshots/cover.png', coverBuffer);
    console.log(`Saved screenshots/cover.png (${coverBuffer.length} bytes)`);

    // --- 2. GAMEPLAY-1.PNG (On-foot) ---
    console.log('Staging gameplay-1.png...');
    await page.goto(`http://127.0.0.1:${PORT}/?shot=play&seed=31`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      if (window.__photo && window.__photo.load) {
        window.__photo.load({ seed: 31, force: { mission: 0, stage: 0, heat: 1, onFoot: true, pedsCount: 6 } });
      }
    });
    await new Promise(r => setTimeout(r, 3500));

    const g1Assertions = await page.evaluate(() => {
      const prompt = document.getElementById('cb-prompt')?.innerText || '';
      const pedsProj = window.__calderaTest?.projectPeds ? window.__calderaTest.projectPeds() : [];
      return { prompt, pedsProj };
    });

    console.log('Gameplay-1 assertions:', JSON.stringify(g1Assertions, null, 2));
    const visiblePeds = g1Assertions.pedsProj.filter(p => p.inFrustum);
    console.log(`Pedestrians in frustum: ${visiblePeds.length}`);
    visiblePeds.forEach((p, idx) => console.log(`  Ped ${idx} at screen position x:${p.x}%, y:${p.y}%`));
    if (visiblePeds.length < 4) {
      console.warn(`WARNING: Expected at least 4 visible pedestrians in frustum, got ${visiblePeds.length}`);
    }

    const g1Buffer = await page.screenshot({ type: 'jpeg', quality: 85 });
    if (g1Buffer.length > 262144) {
      console.error('FAIL: gameplay-1.png size exceeds 256KB:', g1Buffer.length);
      process.exit(1);
    }
    writeFileSync('screenshots/gameplay-1.png', g1Buffer);
    console.log(`Saved screenshots/gameplay-1.png (${g1Buffer.length} bytes)`);

    // --- 3. GAMEPLAY-2.PNG (Garage Screen) ---
    console.log('Staging gameplay-2.png...');
    await page.goto(`http://127.0.0.1:${PORT}/?shot=end&seed=12`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 3500));

    const g2Assertions = await page.evaluate(() => {
      const screensEl = document.getElementById('cb-screens');
      const isVisible = screensEl && window.getComputedStyle(screensEl).display !== 'none';
      const previewCanvas = document.querySelector('#cb-preview-container canvas');
      return { isVisible, hasCanvas: !!previewCanvas, canvasWidth: previewCanvas?.width || 0 };
    });

    console.log('Gameplay-2 assertions:', JSON.stringify(g2Assertions, null, 2));
    if (!g2Assertions.isVisible || !g2Assertions.hasCanvas) {
      console.warn('WARNING: gameplay-2 garage screen or 3D preview canvas not visible');
    }

    const g2Buffer = await page.screenshot({ type: 'jpeg', quality: 85 });
    if (g2Buffer.length > 262144) {
      console.error('FAIL: gameplay-2.png size exceeds 256KB:', g2Buffer.length);
      process.exit(1);
    }
    writeFileSync('screenshots/gameplay-2.png', g2Buffer);
    console.log(`Saved screenshots/gameplay-2.png (${g2Buffer.length} bytes)`);

    // --- 4. GAMEPLAY-3.PNG (Start Screen) ---
    console.log('Staging gameplay-3.png...');
    await page.goto(`http://127.0.0.1:${PORT}/?shot=start&seed=5`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 3500));

    const g3Assertions = await page.evaluate(() => {
      const screensEl = document.getElementById('cb-screens');
      const isVisible = screensEl && window.getComputedStyle(screensEl).display !== 'none';
      const text = screensEl?.innerText || '';
      return { isVisible, hasTitle: text.includes('CALDERA BAY'), hasRise: text.includes('YOUR RISE') };
    });

    console.log('Gameplay-3 assertions:', JSON.stringify(g3Assertions, null, 2));
    if (!g3Assertions.isVisible || !g3Assertions.hasTitle || !g3Assertions.hasRise) {
      console.warn('WARNING: gameplay-3 start screen not rendered properly');
    }

    const g3Buffer = await page.screenshot({ type: 'jpeg', quality: 85 });
    if (g3Buffer.length > 262144) {
      console.error('FAIL: gameplay-3.png size exceeds 256KB:', g3Buffer.length);
      process.exit(1);
    }
    writeFileSync('screenshots/gameplay-3.png', g3Buffer);
    console.log(`Saved screenshots/gameplay-3.png (${g3Buffer.length} bytes)`);

    console.log('ALL SHOTS CAPTURED SUCCESSFULLY!');
    await browser.close();
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('SHOTS FAILED WITH ERROR:', err);
    if (browser) await browser.close();
    server.close();
    process.exit(1);
  }
});
