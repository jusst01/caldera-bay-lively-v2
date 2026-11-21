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
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: '/root/makefun-re/art-tools/chromium/chrome-linux/chrome',
      headless: true,
      args: ['--no-sandbox', '--use-gl=swiftshader', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    const capture = async (filename) => {
      const buf = await page.screenshot({ type: 'png', encoding: 'binary' });
      if (buf.length > 262144) throw new Error(`${filename} too large: ${buf.length}`);
      if (buf.length <= 15000) throw new Error(`${filename} too small: ${buf.length}`);
      writeFileSync(`screenshots/${filename}`, buf);
      console.log(`Saved ${filename} (${buf.length} bytes, sha256: ${require('node:crypto').createHash('sha256').update(buf).digest('hex')})`);
    };

    // --- COVER.PNG ---
    console.log('Staging cover.png...');
    let coverCaptured = false;
    for (let i = 0; i < 6; i++) {
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
      await page.evaluate(() => {
        window.__photo.load({ seed: 77, force: { mission: 6, stage: 1, heat: 4, policeCount: 3, carSpeed: 30 } });
      });
      await new Promise(r => setTimeout(r, 2000));

      const coverRes = await page.evaluate(() => {
        const s = window.__calderaTest.state();
        const units = window.__calderaTest.projectUnits();
        const speedo = document.getElementById('cb-v-speed')?.innerText || '';
        const cash = document.getElementById('cb-s-cash')?.innerText || '';
        const rep = document.getElementById('cb-s-rep')?.innerText || '';
        const missionObj = document.getElementById('cb-m-obj')?.innerText || '';
        return { s, units, speedo, cash, rep, missionObj };
      });
      console.log(`Cover Assertions (attempt ${i+1}):`, coverRes);
      if (coverRes.units.filter(u => u.inFrustum).length >= 2) {
        if (coverRes.s.player.onFoot) throw new Error('Assertion failed: player should be in car');
        if (coverRes.s.player.speed <= 0) throw new Error('Assertion failed: car speed should be > 0');
        const speed = parseInt(coverRes.speedo);
        if (isNaN(speed) || speed < 40 || speed > 140) throw new Error(`Assertion failed: speed ${speed} out of range`);
        if (coverRes.s.police.heat !== 4) throw new Error('Assertion failed: heat should be 4');
        if (!coverRes.missionObj) throw new Error('Assertion failed: mission objective empty');
        if (!coverRes.cash.includes('4,210') || !coverRes.rep.includes('520')) throw new Error('Assertion failed: HUD stats wrong');
        await capture('cover.png');
        coverCaptured = true;
        break;
      }
      console.log(`Retrying cover.png... (units in frustum: ${coverRes.units.filter(u => u.inFrustum).length})`);
    }
    if (!coverCaptured) throw new Error('Failed to capture cover.png after retries');

    // --- GAMEPLAY-1.PNG ---
    console.log('Staging gameplay-1.png...');
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
    await page.evaluate(() => {
        window.__photo.load({ seed: 31, force: { mission: 0, stage: 1, heat: 1, onFoot: true, pedsCount: 6 } });
    });
    await new Promise(r => setTimeout(r, 1500));

    const g1Res = await page.evaluate(() => {
        const s = window.__calderaTest.state();
        const peds = window.__calderaTest.projectPeds();
        return { s, peds };
    });
    console.log('Gameplay-1 Assertions:', g1Res);
    if (g1Res.peds.filter(p => p.inFrustum).length < 4) throw new Error('Assertion failed: not enough peds');
    if (!g1Res.s.player.onFoot) throw new Error('Assertion failed: should be on foot');
    if (g1Res.s.police.heat !== 1) throw new Error('Assertion failed: heat should be 1');
    await capture('gameplay-1.png');

    // --- GAMEPLAY-2.PNG ---
    console.log('Staging gameplay-2.png...');
    await page.goto(`http://127.0.0.1:${PORT}/index.html?shot=end&seed=12`, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const g2Res = await page.evaluate(() => {
        const txt = document.body.innerText;
        const visible = !!document.getElementById('cb-screens');
        return { txt, visible };
    });
    console.log('Gameplay-2 Assertions:', g2Res);
    if (!g2Res.txt.includes('ZORRO GT') || !g2Res.txt.includes("IRIS'S GARAGE")) throw new Error('Assertion failed: Garage text missing');
    await capture('gameplay-2.png');

    // --- GAMEPLAY-3.PNG ---
    console.log('Staging gameplay-3.png...');
    await page.goto(`http://127.0.0.1:${PORT}/index.html?shot=start&seed=5`, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const g3Res = await page.evaluate(() => {
        const txt = document.body.innerText;
        const continueBtn = document.getElementById('cb-btn-continue')?.innerText || '';
        return { txt, continueBtn };
    });
    console.log('Gameplay-3 Assertions:', g3Res);
    if (!g3Res.txt.includes('CALDERA BAY') || !g3Res.txt.includes('YOUR RISE')) throw new Error('Assertion failed: Start screen text missing');
    if (!g3Res.continueBtn.includes('M7/8 · REP 520 · $4,210')) throw new Error(`Assertion failed: Continue line wrong: ${g3Res.continueBtn}`);
    await capture('gameplay-3.png');

    console.log('ALL SHOTS CAPTURED SUCCESSFULLY!');
    await browser.close();
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('SHOTS FAILED:', err);
    if (browser) await browser.close();
    server.close();
    process.exit(1);
  }
});
