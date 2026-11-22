import { createServer } from 'node:http';
import { createReadStream, statSync, writeFileSync } from 'node:fs';
import { resolve, join, extname, normalize, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = (await import('/root/makefun-gta6-v2-ceremony/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default;

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
      args: ['--no-sandbox', '--use-gl=swiftshader', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader']
    });

    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    await page.setViewport({ width: 1280, height: 720 });

    const capturedHashes = new Set();
    const capture = async (filename) => {
      const buf = await page.screenshot({ type: 'png', encoding: 'binary' });
      if (buf.length > 262144) throw new Error(`${filename} too large: ${buf.length}`);
      if (buf.length <= 15000) throw new Error(`${filename} too small: ${buf.length}`);
      const hash = require('node:crypto').createHash('sha256').update(buf).digest('hex');
      if (capturedHashes.has(hash)) throw new Error(`${filename} has duplicate sha256 hash: ${hash}`);
      capturedHashes.add(hash);
      writeFileSync(`screenshots/${filename}`, buf);
      console.log(`Saved ${filename} (${buf.length} bytes, sha256: ${hash})`);
    };

    // --- COVER.PNG ---
    console.log('Staging cover.png...');
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
    await page.evaluate(() => {
      window.__photo.load({seed: 77, force: {mission: 6, stage: 1, heat: 4, carSpeed: 20, policeCount: 7}});
      const player = window.__calderaTest.getPlayer();
      player.x = 0;
      player.z = 12;
      player.heading = Math.PI;
      if (player.car) {
        player.car.x = 0;
        player.car.z = 12;
        player.car.heading = Math.PI;
        player.car.speed = 20;
        if (player.car.mesh) {
          player.car.mesh.position.set(0, 0, 12);
          player.car.mesh.rotation.y = Math.PI;
        }
      }
    });

    // Let ~30 frames run so the chase camera settles behind the car at the intersection
    await new Promise(r => setTimeout(r, 500));

    // Forward-calibration step: stage unit 0 at player-relative (0,-15) under 4 candidate rotations (0/90/180/270 deg)
    let bestRot = 0;
    const candidates = [0, Math.PI/2, Math.PI, 1.5 * Math.PI];

    for (const rot of candidates) {
        const found = await page.evaluate((rot) => {
            const player = window.__calderaTest.getPlayer();
            const cosH = Math.cos(player.heading + rot);
            const sinH = Math.sin(player.heading + rot);
            const offsets = [
                { x: 0, z: -15 },
                { x: -6, z: -10 },
                { x: 6, z: -12 },
                { x: -1, z: -22 }
            ];
            offsets.forEach((offset, i) => {
                const rx = offset.x * cosH + offset.z * sinH;
                const rz = -offset.x * sinH + offset.z * cosH;
                window.__calderaTest.stageUnitAt(i, player.x + rx, player.z + rz);
            });

            const projected = window.__calderaTest.projectUnits();
            const unit = projected.find(u => u.id === 'P0');
            return unit && unit.inFrustum && unit.x >= 35 && unit.x <= 65;
        }, rot);

        if (found) {
            bestRot = rot;
            console.log('DEBUG: Found bestRot:', bestRot);
            break;
        }
        await new Promise(r => setTimeout(r, 68)); // ~2 frames apart
    }
    console.log('DEBUG: Final bestRot:', bestRot);

    const covRes = await page.evaluate((bestRot) => {
        const player = window.__calderaTest.getPlayer();
        const playerHeading = player.heading;
        const offsets = [
            { x: 0, z: -15 },  // Unit 0
            { x: -6, z: -10 }, // Unit 1
            { x: 6, z: -12 },  // Unit 2
            { x: -1, z: -22 }  // Unit 3
        ];

        offsets.forEach((offset, i) => {
            const cosH = Math.cos(playerHeading + bestRot);
            const sinH = Math.sin(playerHeading + bestRot);
            const rx = offset.x * cosH + offset.z * sinH;
            const rz = -offset.x * sinH + offset.z * cosH;
            window.__calderaTest.stageUnitAt(i, player.x + rx, player.z + rz);
        });

        for (let i = 4; i < 7; i++) {
            window.__calderaTest.stageUnitAt(i, player.x + 1000, player.z + 1000);
        }

        if (player.car) {
            player.car.speed = 25; // 90 KM/H
            window.__calderaTest.forceSpeed = 25;
        }

        const s = window.__calderaTest.state();
        const units = window.__calderaTest.projectUnits();
        const carProj = window.__calderaTest.projectCar ? window.__calderaTest.projectCar() : null;
        const dispatchText = document.getElementById('cb-d-units')?.innerText || '';
        return { s, units, carProj, dispatchText };
    }, bestRot);

    console.log('Cover Assertions:', covRes);
    if (covRes.s.player.onFoot) throw new Error('Assertion failed: should not be on foot');
    const carSpeedKmh = Math.round(Math.abs(covRes.s.player.car.speed) * 3.6);
    if (carSpeedKmh < 40 || carSpeedKmh > 140) throw new Error(`Assertion failed: car speed out of range: ${carSpeedKmh}`);
    if (covRes.s.police.heat !== 4) throw new Error('Assertion failed: heat should be 4');
    if (covRes.s.player.cash !== 4210) throw new Error('Assertion failed: cash incorrect');
    if (covRes.s.player.rep !== 520) throw new Error('Assertion failed: rep incorrect');
    if (covRes.s.mission.jobLabel !== 'The Long Haul' || covRes.s.mission.stageLabel !== 'Stage 1') {
        throw new Error(`Assertion failed: mission incorrect: ${JSON.stringify(covRes.s.mission)}`);
    }

    const validUnitsInFrustum = covRes.units.filter(u => u.inFrustum && u.x >= 15 && u.x <= 85 && u.y >= 15 && u.y <= 85);
    if (validUnitsInFrustum.length < 2) throw new Error(`Assertion failed: not enough staged units in frustum: ${validUnitsInFrustum.length}`);

    if (!covRes.carProj || !covRes.carProj.inFrustum || covRes.carProj.x < 30 || covRes.carProj.x > 70 || covRes.carProj.y < 35 || covRes.carProj.y > 80) {
        throw new Error(`Assertion failed: projectCar() not in range [30-70%, 35-80%]: ${JSON.stringify(covRes.carProj)}`);
    }

    const distMatches = [...covRes.dispatchText.matchAll(/·\s*(\d+)m\s*·/g)].map(m => parseInt(m[1]));
    console.log('Parsed top dispatch distances:', distMatches.slice(0, 3));
    if (distMatches.slice(0, 3).some(d => d > 45)) throw new Error(`Assertion failed: top 3 dispatch distances > 45m: ${distMatches}`);

    await new Promise(r => setTimeout(r, 50)); // screenshot within ~3 frames
    await capture('cover.png');

    if (process.argv[2] === 'cover') {
        console.log('COVER SHOT ONLY COMPLETED SUCCESSFULLY!');
        await browser.close();
        server.close();
        process.exit(0);
    }

    // --- GAMEPLAY-1.PNG ---
    console.log('Staging gameplay-1.png...');
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
    await page.evaluate((bestRot) => {
      window.__photo.load({ seed: 31, force: { mission: 0, stage: 1, heat: 1, onFoot: true, pedsCount: 6 } });
      const player = window.__calderaTest.getPlayer();

      const heading = player.heading + bestRot;
      const cosH = Math.cos(heading);
      const sinH = Math.sin(heading);
      const offsets = [
        { x: 0, z: -5 },
        { x: -2, z: -7 },
        { x: 2, z: -8 },
        { x: -1, z: -10 },
        { x: 1, z: -12 },
        { x: 0, z: -15 }
      ];
      offsets.forEach((offset, i) => {
        const rx = offset.x * cosH + offset.z * sinH;
        const rz = -offset.x * sinH + offset.z * cosH;
        window.__calderaTest.stagePedAt(i, player.x + rx, player.z + rz);
      });
    }, bestRot);
    await new Promise(r => setTimeout(r, 1500));

    const g1Res = await page.evaluate(() => {
        const s = window.__calderaTest.state();
        const peds = window.__calderaTest.projectPeds();
        const player = window.__calderaTest.getPlayer();
        const validPeds = peds.filter(p => p.inFrustum && Math.sqrt((p.px - player.x)**2 + (p.pz - player.z)**2) <= 20);
        return { s, peds, validPeds };
    });
    console.log('Gameplay-1 Assertions:', g1Res);
    g1Res.peds.forEach((p, i) => {
        const dist = Math.sqrt((p.px - g1Res.s.player.x)**2 + (p.pz - g1Res.s.player.z)**2);
        console.log(`Ped ${i}: dist=${dist.toFixed(1)}m, inFrustum=${p.inFrustum}, x=${p.x}%, y=${p.y}%`);
    });
    if (g1Res.validPeds.length < 4) throw new Error(`Assertion failed: not enough peds within 20m and inFrustum: found ${g1Res.validPeds.length}`);
    if (!g1Res.s.player.onFoot) throw new Error('Assertion failed: should be on foot');
    if (g1Res.s.police.heat !== 1) throw new Error('Assertion failed: heat should be 1');
    await capture('gameplay-1.png');

    // --- GAMEPLAY-2.PNG ---
    console.log('Staging gameplay-2.png...');
    await page.goto(`http://127.0.0.1:${PORT}/index.html?shot=end&seed=12`, { waitUntil: 'load' });

    // Poll for non-blank preview canvas (timeout ~10s, fail if black)
    const startTime = Date.now();
    let isNonBlank = false;
    while (Date.now() - startTime < 10000) {
        isNonBlank = await page.evaluate(() => {
            const canvas = document.querySelector('#cb-preview-container canvas');
            if (!canvas) return false;
            const off = document.createElement('canvas');
            off.width = canvas.width || 300;
            off.height = canvas.height || 300;
            const octx = off.getContext('2d');
            try {
                octx.drawImage(canvas, 0, 0);
                const imgData = octx.getImageData(0, 0, off.width, off.height);
                const data = imgData.data;
                let nonZero = 0;
                for (let i = 3; i < data.length; i += 4) {
                    if (data[i] > 10 || data[i-1] > 10 || data[i-2] > 10) {
                        nonZero++;
                    }
                }
                return nonZero > (off.width * off.height * 0.01);
            } catch (e) {
                return false;
            }
        });
        if (isNonBlank) break;
        await new Promise(r => setTimeout(r, 200));
    }
    if (!isNonBlank) throw new Error('Assertion failed: preview canvas is blank (black)');

    const g2Res = await page.evaluate(() => {
        const txt = document.body.innerText;
        const garageCars = document.querySelectorAll('#cb-owned-list > div').length;
        const hasZorro = txt.includes('ZORRO GT');
        return { txt, garageCars, hasZorro };
    });
    console.log('Gameplay-2 Assertions:', g2Res);
    if (g2Res.garageCars !== 4) throw new Error(`Assertion failed: expected 4 cars, found ${g2Res.garageCars}`);
    if (!g2Res.hasZorro) throw new Error('Assertion failed: ZORRO GT text missing');
    await capture('gameplay-2.png');

    // --- GAMEPLAY-3.PNG ---
    console.log('Staging gameplay-3.png...');
    await page.goto(`http://127.0.0.1:${PORT}/index.html?shot=start&seed=5`, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const g3Res = await page.evaluate(() => {
        const txt = document.body.innerText;
        const continueBtn = document.getElementById('cb-btn-continue')?.innerText || '';
        const takeoverEl = document.getElementById('cb-t-num')?.innerText || '';
        return { txt, continueBtn, takeoverEl };
    });
    console.log('Gameplay-3 Assertions:', g3Res);
    if (!g3Res.txt.includes('YOUR RISE')) throw new Error('Assertion failed: YOUR RISE text missing');
    if (!g3Res.continueBtn.includes('M7/8 · REP 520 · $4,210')) throw new Error(`Assertion failed: Continue line wrong: ${g3Res.continueBtn}`);
    if (!g3Res.txt.includes('3/5')) throw new Error(`Assertion failed: takeover 3/5 missing: ${g3Res.txt}`);
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
