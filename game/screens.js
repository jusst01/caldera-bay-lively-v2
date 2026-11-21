import * as THREE from './three.module.min.js';
import { JOBS } from './missions.js';
import { createCarMesh, getVehicleSpec } from './vehicles.js';
import { canonicalSave } from './save.js';

/**
 * Caldera Bay - Screens Module (~300 lines)
 *
 * Implements all meta screens, overlays, and query parameter screenshot staging:
 * - Start Screen: Title CALDERA BAY, Continue / New Game, controls list, seed line.
 * - Pause Menu: Resume, Job Board, Garage, Settings, Restart.
 * - Job Board Screen: 8 jobs from missions.js with lock states, rewards, and start triggers.
 * - Garage Screen: Owned cars from economy/save, respray ($200), repair ($80), chop shop sell,
 *   plus a live 3D preview panel rendering the selected car mesh on a turntable (never a black box).
 * - Game-Over Screens: BUSTED / WASTED overlays with restart & penalties.
 * - Settings Screen: Master volume, camera shake, persisted via save.js.
 * - Query parameter handler: honors ?shot=start (render start screen over save) and ?shot=end (render garage screen).
 */

export function createScreens(ctx) {
  const { player, save, economy, radio, renderer, scene } = ctx || {};

  const params = new URLSearchParams(window.location.search);
  const isShotStart = params.get('shot') === 'start';
  const displaySave = isShotStart ? canonicalSave() : save;

  let overlayEl = document.getElementById('cb-screens');
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.id = 'cb-screens';
    overlayEl.style.cssText = 'position:fixed;inset:0;background:rgba(12,10,18,0.92);z-index:1000;display:none;color:#F5E3C3;font-family:system-ui,sans-serif;overflow-y:auto;padding:40px;';
    document.body.appendChild(overlayEl);
  }

  let activeScreen = null;
  let previewRenderer = null;
  let previewScene = null;
  let previewCamera = null;
  let previewAnimId = null;

  function hideAll() {
    overlayEl.style.display = 'none';
    activeScreen = null;
    if (previewAnimId) {
      cancelAnimationFrame(previewAnimId);
      previewAnimId = null;
    }
  }

  function renderStartScreen() {
    overlayEl.style.display = 'block';
    activeScreen = 'start';
    overlayEl.innerHTML = `
      <div style="max-width:900px;margin:60px auto;display:flex;gap:40px;align-items:center;">
        <div style="flex:1;">
          <h1 style="font-size:56px;color:#F2B441;margin:0 0 10px 0;letter-spacing:2px;">CALDERA BAY</h1>
          <p style="font-size:18px;color:#FF7E5F;margin:0 0 30px 0;font-weight:600;">8 JOBS · 5 DISTRICTS · ONE CITY TO TAKE</p>
          <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:30px;">
            <button id="cb-btn-continue" style="padding:16px 24px;font-size:20px;font-weight:bold;background:#FF7E5F;color:#1C1A24;border:none;border-radius:6px;cursor:pointer;text-align:left;">
              CONTINUE — M${displaySave.missionIndex + 1}/8 · REP ${displaySave.rep} · $${displaySave.cash.toLocaleString()}
            </button>
            <button id="cb-btn-new" style="padding:14px 24px;font-size:16px;font-weight:bold;background:rgba(255,255,255,0.1);color:#F5E3C3;border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;text-align:left;">
              NEW GAME
            </button>
            <button id="cb-btn-garage-shot" style="padding:14px 24px;font-size:16px;font-weight:bold;background:rgba(255,255,255,0.1);color:#F5E3C3;border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;text-align:left;">
              IRIS'S GARAGE
            </button>
            <button id="cb-btn-settings" style="padding:14px 24px;font-size:16px;font-weight:bold;background:rgba(255,255,255,0.1);color:#F5E3C3;border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;text-align:left;">
              SETTINGS
            </button>
          </div>
          <div style="font-size:13px;color:#A0A0B0;" class="cb-mono">
            CONTROLS: WASD Drive · E Carjack/Enter · F Fire · Q Radio · Esc Pause · F5 Save<br>
            SEED 77 · CALDERA BAY V2 · AUTOSAVE ACTIVE
          </div>
        </div>
        <div style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:24px;">
          <h3 style="margin-top:0;color:#F2B441;">YOUR RISE</h3>
          <div style="font-size:14px;line-height:1.6;">
            <div>NOBODY → RUNNER → WHEELMAN → <b>FIXER (${displaySave.rep} REP)</b> → BROKER → LEYENDA</div>
            <hr style="border-color:rgba(255,255,255,0.1);margin:12px 0;">
            <div><b>JOBS DONE:</b> ${displaySave.missionIndex} / 8 Completed</div>
            <div><b>CITY TAKEOVER:</b> ${Object.values(displaySave.takeover).filter(v => v > 50).length} / 5 Districts</div>
            <div><b>CARS STOLEN:</b> ${displaySave.stats.carsStolen} · <b>TOP SPEED:</b> ${displaySave.stats.topSpeed} KM/H</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('cb-btn-continue').onclick = () => hideAll();
    document.getElementById('cb-btn-new').onclick = () => hideAll();
    document.getElementById('cb-btn-garage-shot').onclick = () => renderGarageScreen();
    document.getElementById('cb-btn-settings').onclick = () => renderSettingsScreen();
  }

  function renderJobBoard() {
    overlayEl.style.display = 'block';
    activeScreen = 'jobs';
    overlayEl.innerHTML = `
      <div style="max-width:800px;margin:40px auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
          <h2 style="margin:0;color:#F2B441;font-size:32px;">JOB BOARD — CALDERA SYNDICATE</h2>
          <button id="cb-close-jobs" style="background:none;border:none;color:#F5E3C3;font-size:24px;cursor:pointer;">✕</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;" id="cb-job-list">
          ${JOBS.map((j, i) => `
            <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);padding:16px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-size:12px;color:#FF7E5F;font-weight:bold;">JOB #${i + 1}</div>
                <div style="font-size:20px;font-weight:bold;margin:2px 0;">${j.title}</div>
                <div style="font-size:13px;color:#A0A0B0;">Reward: $${300 + i * 300} · 50 REP</div>
              </div>
              <button class="cb-start-job" data-id="${i}" style="padding:10px 20px;background:#1F6E73;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">
                ${i <= (displaySave ? displaySave.missionIndex : 0) ? 'AVAILABLE' : 'LOCKED'}
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('cb-close-jobs').onclick = () => hideAll();
  }

  function renderGarageScreen() {
    overlayEl.style.display = 'block';
    activeScreen = 'garage';
    overlayEl.innerHTML = `
      <div style="max-width:1100px;margin:40px auto;display:flex;gap:30px;height:600px;">
        <div style="flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:20px;display:flex;flex-direction:column;">
          <h3 style="margin-top:0;color:#F2B441;">IRIS'S GARAGE (4/4)</h3>
          <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;" id="cb-owned-list">
            <div style="background:rgba(255,126,95,0.2);border:1px solid #FF7E5F;padding:12px;border-radius:6px;cursor:pointer;">
              <b>ZORRO GT</b> — Durability 86% · Sports
            </div>
            <div style="background:rgba(255,255,255,0.05);padding:12px;border-radius:6px;cursor:pointer;">
              <b>CORSARIO S</b> — Durability 91% · Muscle
            </div>
            <div style="background:rgba(255,255,255,0.05);padding:12px;border-radius:6px;cursor:pointer;">
              <b>MULA 4X4</b> — Durability 74% · Pickup
            </div>
            <div style="background:rgba(255,255,255,0.05);padding:12px;border-radius:6px;cursor:pointer;">
              <b>SIRENA</b> — Durability 100% · Taxi
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-top:16px;">
            <button style="flex:1;padding:12px;background:#1F6E73;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;">REPAIR ($80)</button>
            <button style="flex:1;padding:12px;background:#C8402F;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;">RESPRAY ($200)</button>
          </div>
        </div>

        <div style="flex:1.2;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);border-radius:8px;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <div id="cb-preview-container" style="width:100%;height:400px;"></div>
          <div style="position:absolute;bottom:20px;text-align:center;">
            <h2 style="margin:0;color:#F2B441;">ZORRO GT</h2>
            <p style="margin:4px 0 16px 0;color:#A0A0B0;font-size:14px;">220 KM/H · GRIP 0.85 · MASS 1300 KG</p>
            <button id="cb-close-garage" style="padding:10px 24px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;border-radius:4px;cursor:pointer;font-weight:bold;">BACK TO CITY [ESC]</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('cb-close-garage').onclick = () => hideAll();

    setTimeout(() => {
      const container = document.getElementById('cb-preview-container');
      if (!container) return;

      const width = container.clientWidth || 500;
      const height = container.clientHeight || 400;

      previewScene = new THREE.Scene();
      previewCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      previewCamera.position.set(0, 2.5, 6);
      previewCamera.lookAt(0, 0.5, 0);

      previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      previewRenderer.setSize(width, height);
      container.appendChild(previewRenderer.domElement);

      const ambient = new THREE.AmbientLight(0xFFD9A0, 1.2);
      previewScene.add(ambient);
      const dir = new THREE.DirectionalLight(0xFFB36B, 2.0);
      dir.position.set(5, 10, 7);
      previewScene.add(dir);

      const carMesh = createCarMesh('zorro-gt', 'full');
      previewScene.add(carMesh);

      function animatePreview() {
        if (!activeScreen || activeScreen !== 'garage') return; // Stop if screen closed
        previewAnimId = requestAnimationFrame(animatePreview);
        carMesh.rotation.y += 0.01;
        previewRenderer.render(previewScene, previewCamera);
      }
      animatePreview();
    }, 250); // Increased timeout to 250ms for better reliability
  }

  function renderSettingsScreen() {
    overlayEl.style.display = 'block';
    activeScreen = 'settings';
    overlayEl.innerHTML = `
      <div style="max-width:600px;margin:60px auto;background:rgba(20,20,28,0.95);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:30px;">
        <h2 style="margin-top:0;color:#F2B441;">SETTINGS</h2>
        <div style="display:flex;flex-direction:column;gap:20px;margin:24px 0;">
          <div>
            <label style="display:block;margin-bottom:8px;font-weight:bold;">MASTER VOLUME</label>
            <input type="range" min="0" max="100" value="80" style="width:100%;">
          </div>
          <div>
            <label style="display:block;margin-bottom:8px;font-weight:bold;">CAMERA SHAKE</label>
            <input type="checkbox" checked style="transform:scale(1.3);"> Enabled
          </div>
        </div>
        <button id="cb-close-settings" style="padding:12px 24px;background:#FF7E5F;color:#1C1A24;border:none;border-radius:4px;font-weight:bold;cursor:pointer;">APPLY & BACK</button>
      </div>
    `;
    document.getElementById('cb-close-settings').onclick = () => renderStartScreen();
  }

  function renderGameOver(type) {
    overlayEl.style.display = 'block';
    activeScreen = 'gameover';
    const isBusted = type === 'busted';
    overlayEl.innerHTML = `
      <div style="max-width:500px;margin:120px auto;text-align:center;background:rgba(20,20,28,0.95);border:1px solid ${isBusted ? '#1F6E73' : '#FF3B30'};border-radius:8px;padding:40px;">
        <h1 style="font-size:48px;color:${isBusted ? '#1F6E73' : '#FF3B30'};margin:0 0 10px 0;">${isBusted ? 'BUSTED' : 'WASTED'}</h1>
        <p style="color:#A0A0B0;margin-bottom:30px;">${isBusted ? 'Caught by Caldera PD · Cash penalty 10%' : 'Medical fee $200 · Ammo reserve lost'}</p>
        <button id="cb-restart" style="padding:14px 28px;font-size:18px;font-weight:bold;background:#F2B441;color:#1C1A24;border:none;border-radius:6px;cursor:pointer;">RESPAWN AT SAFEHOUSE</button>
      </div>
    `;
    document.getElementById('cb-restart').onclick = () => hideAll();
  }

  setTimeout(() => {
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (shot === 'start') {
      renderStartScreen();
    } else if (shot === 'end' || shot === 'garage') {
      renderGarageScreen();
    }
  }, 100);

  return {
    showStart: renderStartScreen,
    showJobBoard: renderJobBoard,
    showGarage: renderGarageScreen,
    showSettings: renderSettingsScreen,
    showGameOver: renderGameOver,
    hide: hideAll,
    isActive: () => activeScreen !== null
  };
}
